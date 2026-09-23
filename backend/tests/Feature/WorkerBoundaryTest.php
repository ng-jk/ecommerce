<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Domain\StoreActions;
use App\Http\Controllers\OperationController;
use App\Models\Operation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Exceptions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkerBoundaryTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function customer(Shop $shop): User
    {
        return User::factory()->create(['shop_id' => $shop->id, 'role' => 'customer', 'password' => 'Password123!']);
    }

    public function test_worker_retries_failure_without_leaking_details_and_stops_after_three_attempts(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $response = $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        Exceptions::fake();
        $this->mock(StoreActions::class)->shouldReceive('products')->times(3)->andThrow(new \RuntimeException('private database details'));

        foreach ([1, 2, 3] as $attempt) {
            app(OperationProcessor::class)->processNext();
            $op->refresh();
            $this->assertSame($attempt, $op->attempts);
            $this->assertSame($attempt === 3 ? Operation::Failed : Operation::Queued, $op->status);
            $this->assertSame(['message' => 'The operation could not complete.'], $op->result);
            $this->travel(10)->seconds();
        }
        $this->assertFalse(app(OperationProcessor::class)->processNext());
        Exceptions::assertReported(\RuntimeException::class);
    }

    public function test_revoked_native_token_rejects_accepted_operation_with_401(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = $this->customer($shop);
        $token = $user->createToken('test');
        Sanctum::actingAs($user);
        $response = $this->getJson('/api/v1/shops/fashion/cart')->assertAccepted();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $op->update(['token_id' => $token->accessToken->id]);
        $token->accessToken->delete();

        app(OperationProcessor::class)->processNext();

        $this->assertSame(401, $op->fresh()->http_status);
        $this->assertSame(Operation::Rejected, $op->fresh()->status);
        $this->assertSame(0, $user->fresh()->version);
    }

    public function test_browser_login_requires_session_and_logout_invalidates_it(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = $this->customer($shop);
        $response = $this->postJson('/api/v1/shops/fashion/auth/login', ['email' => $user->email, 'password' => 'Password123!'])->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $headers = ['X-Operation-Token' => str_repeat('a', 64)];
        $this->getJson($response->json('poll_url'), $headers)->assertUnprocessable()->assertJsonStructure(['validation_error' => ['session']]);
        $session = new Store('testing', new ArraySessionHandler(120));
        $session->start();
        $oldId = $session->getId();
        $request = Request::create('/');
        $request->headers->set('X-Operation-Token', str_repeat('a', 64));
        $request->setLaravelSession($session);
        $controller = app(OperationController::class);

        $result = $controller->show($request, $shop, $response->json('operation_id'));

        $this->assertSame(200, $result->getStatusCode());
        $this->assertSame($user->id, Auth::guard('web')->id());
        $this->assertNotSame($oldId, $session->getId());
        Sanctum::actingAs($user);
        $logout = $this->postJson('/api/v1/shops/fashion/auth/logout')->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $session->put('private', 'value');
        $controller->show($request, $shop, $logout->json('operation_id'));
        $this->assertFalse($session->has('private'));
        $this->assertSame(1, $user->fresh()->auth_version);
    }

    public function test_polling_requires_current_owner_and_returns_state_only_to_them(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = $this->customer($shop);
        Sanctum::actingAs($user);
        $response = $this->getJson('/api/v1/shops/fashion/cart')->assertAccepted();
        app(OperationProcessor::class)->processNext();
        Sanctum::actingAs($user->fresh());
        $headers = ['X-Operation-Token' => str_repeat('a', 64)];
        $this->getJson($response->json('poll_url'), $headers)->assertOk()->assertJsonPath('state.account', 'active');
        Sanctum::actingAs($this->customer($shop));
        $this->getJson($response->json('poll_url'), $headers)->assertNotFound();
        $this->assertSame('Customer', User::options()[$user->role]);
        $this->assertSame('Succeeded', Operation::options()[Operation::Succeeded]);
    }

    public function test_worker_once_processes_one_operation_and_exits_successfully(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $this->artisan('commerce:work', ['--once' => true])->assertSuccessful();
        $this->assertDatabaseHas('operations', ['status' => 'succeeded']);
        $this->artisan('commerce:work', ['--once' => true])->assertSuccessful();
    }

    public function test_idle_daemon_waits_and_continues_to_the_next_attempt(): void
    {
        $this->mock(OperationProcessor::class)->shouldReceive('processNext')->once()->andReturn(false);
        app(OperationProcessor::class)->shouldReceive('processNext')->once()->andThrow(new \RuntimeException('Stop test daemon'));
        $this->expectExceptionMessage('Stop test daemon');
        $this->artisan('commerce:work')->run();
    }

    public function test_fenced_worker_does_not_execute_a_claim_that_changed_ownership(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $retrieved = 0;
        Operation::retrieved(function (Operation $operation) use (&$retrieved): void {
            $retrieved++;
            if ($retrieved === 2) {
                $operation->attempts++;
            }
        });
        $this->mock(StoreActions::class)->shouldNotReceive('products');

        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->assertDatabaseHas('operations', ['status' => 'processing', 'attempts' => 1]);
    }

    public function test_customer_order_status_filter_returns_only_matching_orders(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        Sanctum::actingAs($this->customer($shop));
        $response = $this->getJson('/api/v1/shops/fashion/orders?status=completed')->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 20, 'total' => 0]], $op->result['orders']);
    }
}
