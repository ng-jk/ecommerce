<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperationTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    public function test_acceptance_is_durable_and_processing_rechecks_authorization(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = User::create(['shop_id' => $shop->id, 'name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'Password123!', 'role' => 'admin']);
        Sanctum::actingAs($user);
        $response = $this->getJson('/api/v1/shops/fashion/admin/products')->assertAccepted()->assertJsonPath('status', 'queued');
        $this->assertDatabaseCount('operations', 1);
        $user->update(['role' => 'customer']);
        app(OperationProcessor::class)->processNext();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame(Operation::Rejected, $op->status);
        $this->assertSame(403, $op->http_status);
    }

    public function test_idempotency_reuses_operation_and_rejects_different_payload(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $headers = ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('b', 64)];
        $first = $this->getJson('/api/v1/shops/fashion/products', $headers)->assertAccepted();
        $this->getJson('/api/v1/shops/fashion/products', $headers)->assertAccepted()->assertJsonPath('operation_id', $first->json('operation_id'));
        $this->getJson('/api/v1/shops/fashion/products?search=other', $headers)->assertConflict();
        $this->assertDatabaseCount('operations', 1);
        app(OperationProcessor::class)->processNext();
        $this->getJson($first->json('poll_url'), $headers)->assertOk()->assertJsonPath('status', 'succeeded')->assertJsonPath('result.products.meta.total', 0);
        $this->getJson($first->json('poll_url'))->assertNotFound();
    }

    public function test_worker_validation_has_only_the_documented_error_shape(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $response = $this->getJson('/api/v1/shops/fashion/products?page=-1')->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame(Operation::Rejected, $op->status);
        $this->assertSame(422, $op->http_status);
        $this->assertArrayHasKey('page', $op->result['validation_error']);
        $this->assertArrayNotHasKey('errors', $op->result);
    }

    public function test_expired_worker_lease_is_recovered_and_retry_budget_is_bounded(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $response = $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $op->update(['status' => Operation::Processing, 'attempts' => 1, 'available_at' => now()->addMinute()]);
        $this->assertFalse(app(OperationProcessor::class)->processNext());
        $this->travel(61)->seconds();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->assertSame(Operation::Succeeded, $op->fresh()->status);
        $this->assertSame(2, $op->fresh()->attempts);
        $exhausted = $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $op = Operation::where('public_id', $exhausted->json('operation_id'))->firstOrFail();
        $op->update(['status' => Operation::Processing, 'attempts' => 3, 'available_at' => now()->subSecond()]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Failed, $op->fresh()->status);
        $this->assertSame(503, $op->fresh()->http_status);
    }

    public function test_login_receipt_cannot_authenticate_after_account_revocation(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = User::create(['shop_id' => $shop->id, 'name' => 'Customer', 'email' => 'customer@example.test', 'password' => 'Password123!', 'role' => 'customer']);
        $headers = ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('a', 64)];
        $response = $this->postJson('/api/v1/shops/fashion/auth/login', ['email' => $user->email, 'password' => 'Password123!', 'device_name' => 'Test'], $headers)->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $this->getJson($response->json('poll_url'), $headers)->assertOk()->assertJsonMissingPath('result.auth_version');
        $user->increment('auth_version');
        $this->getJson($response->json('poll_url'), $headers)->assertForbidden();
    }

    public function test_unknown_worker_action_uses_validation_error_contract(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $response = $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $op = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $op->update(['action' => 'unknown']);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(422, $op->fresh()->http_status);
        $this->assertSame(['validation_error' => ['action' => ['Unknown command.']]], $op->fresh()->result);
    }
}
