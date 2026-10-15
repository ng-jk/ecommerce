<?php

namespace Tests\Feature;

use App\Models\ServiceDelivery;
use App\Modules\Lending\AuthorizedLendingScope;
use App\Modules\Lending\LendingActions;
use App\Modules\Lending\LendingCommandHandler;
use App\Modules\Lending\LendingSchedule;
use App\Modules\Lending\Models\LendingApplication as Application;
use App\Modules\Lending\Models\LendingProduct as Product;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class LendingTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-13 12:00:00', 'UTC'));
        $migration = require database_path('migrations/services/lending/2026_10_13_035625_create_lending_tables.php');
        $migration->down();
        $migration->up();
        if (! Schema::hasTable('service_inboxes')) {
            (require database_path('migrations/2026_10_13_015300_create_service_exchange_tables.php'))->up();
        }
        foreach (['service_inboxes', 'service_deliveries'] as $table) {
            DB::table($table)->delete();
        }
    }

    private function message(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'lending', 'topic' => 'lending.command', 'version' => 1,
            'payload' => ['scope' => ['organization_id' => $org, 'platform_user_id' => $user, 'token_id' => 1, 'auth_version' => 0,
                'application' => 'lending', 'action' => 'lending.'.$action],
                'command' => ['operation_id' => (string) Str::uuid(), 'input' => $input, ...($id === null ? [] : ['id' => $id])]]];
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        $scope = AuthorizedLendingScope::fromVerifiedExchange($this->message($action, $input, $id, $user, $org), fn (): bool => true);

        return DB::transaction(fn () => app(LendingActions::class)->execute($scope, $input, $id));
    }

    private function denied(callable $run, int $status): void
    {
        try {
            $run();
            $this->fail('Expected rejection.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame($status, $error->getStatusCode());
        } catch (ModelNotFoundException) {
            $this->assertSame(404, $status);
        }
    }

    private function invalid(callable $run): void
    {
        try {
            $run();
            $this->fail('Expected validation.');
        } catch (ValidationException $error) {
            $this->assertNotEmpty($error->errors());
        }
    }

    private function productInput(): array
    {
        return ['code' => 'explicit-product', 'name' => 'Owner terms', 'jurisdiction_label' => 'Operator-defined scope', 'terms_text' => 'Fixed whole-term charge. No disbursement or repayment is recorded.',
            'currency' => 'MYR', 'minor_unit_digits' => 2, 'principal_min_minor' => 1, 'principal_max_minor' => 1000000,
            'term_rate_numerator' => 1, 'term_rate_denominator' => 10, 'installment_count' => 3, 'interval_days' => 30];
    }

    private function updateProduct(Product $product, array $changes = []): array
    {
        $input = $this->productInput();
        unset($input['code']);

        return $this->runAction('products.update', [...$input, 'expected_version' => $product->refresh()->version, 'status' => Product::Active, ...$changes], $product->id)['product'];
    }

    private function product(): Product
    {
        $created = $this->runAction('products.create', $this->productInput())['product'];
        $product = Product::findOrFail($created['id']);
        $this->updateProduct($product);

        return $product->refresh();
    }

    private function application(Product $product): array
    {
        return $this->runAction('applications.create', ['product_id' => $product->id, 'principal_minor' => 101, 'first_due_date' => '2026-11-01', 'purpose' => 'Private purpose'])['application'];
    }

    private function submit(array $application): array
    {
        return $this->runAction('applications.submit', ['expected_version' => $application['version']], $application['id'])['application'];
    }

    public function test_origination_separate_decision_and_immutable_exact_schedule(): void
    {
        $product = $this->product();
        $this->assertSame(1, $this->runAction('products.list', ['page' => '1', 'per_page' => '1', 'status' => Product::Active])['meta']['total']);
        $this->assertSame($product->id, $this->runAction('products.detail', [], $product->id)['product']['id']);
        $application = $this->application($product);
        $application = $this->runAction('applications.update', ['expected_version' => 0, 'principal_minor' => 103, 'first_due_date' => '2026-11-01', 'purpose' => 'Updated purpose'], $application['id'])['application'];
        $this->assertSame(1, $this->runAction('applications.list', ['status' => Application::Draft])['meta']['total']);
        $this->assertSame(0, $this->runAction('applications.list', [], null, 8)['meta']['total']);
        $this->assertSame(1, $this->runAction('reviews.list', [], null, 8)['meta']['total']);
        $this->assertArrayNotHasKey('terms_text', $this->runAction('products.list')['data'][0]->toArray());
        $this->assertArrayNotHasKey('purpose', $this->runAction('reviews.list', [], null, 8)['data'][0]->toArray());
        $this->assertArrayNotHasKey('terms_snapshot', $this->runAction('applications.list')['data'][0]->toArray());
        $this->assertSame('Updated purpose', $this->runAction('reviews.detail', [], $application['id'], 8)['application']['purpose']);
        $this->assertSame($application, $this->runAction('applications.detail', [], $application['id'])['application']);
        $submitted = $this->submit($application);
        $this->assertSame(Application::Submitted, $submitted['status']);
        $this->assertSame($product->version, $submitted['terms_snapshot']['product_version']);
        $decision = ['expected_version' => $submitted['version'], 'decision' => Application::Approved, 'decision_note' => 'Reviewed configured terms and evidence.'];
        $this->denied(fn () => $this->runAction('reviews.decide', $decision, $application['id']), 403);
        $this->updateProduct($product, ['term_rate_numerator' => 9]);
        $approved = $this->runAction('reviews.decide', $decision, $application['id'], 8)['application'];
        $this->assertSame($submitted['terms_snapshot'], $approved['terms_snapshot']);
        $this->assertSame(8, $approved['decided_by_platform_user_id']);
        $schedule = $this->runAction('applications.schedule', [], $application['id']);
        $this->assertSame(103, $schedule['principal_minor']);
        $this->assertSame(11, $schedule['charge_minor']);
        $this->assertSame([35, 34, 34], array_column($schedule['installments'], 'principal_minor'));
        $this->assertSame([4, 4, 3], array_column($schedule['installments'], 'charge_minor'));
        $this->assertSame(['2026-11-01', '2026-12-01', '2026-12-31'], array_column($schedule['installments'], 'due_date'));
        $this->assertSame(114, array_sum(array_column($schedule['installments'], 'total_minor')));
        $this->denied(fn () => $this->runAction('reviews.decide', $decision, $application['id'], 8), 409);
        $this->denied(fn () => $this->runAction('applications.withdraw', ['expected_version' => $approved['version']], $application['id']), 409);
        $this->updateProduct($product, ['status' => Product::Disabled]);
        $this->assertSame($schedule, $this->runAction('applications.schedule', [], $application['id']));
        $this->assertStringNotContainsString('Updated purpose', DB::table('lending_applications')->value('purpose'));
    }

    public function test_state_guards_scope_stale_versions_disabled_products_and_due_dates(): void
    {
        $product = $this->product();
        $draft = $this->application($product);
        $this->denied(fn () => $this->runAction('applications.schedule', [], $draft['id']), 409);
        $this->denied(fn () => $this->runAction('applications.detail', [], $draft['id'], 8), 404);
        $this->denied(fn () => $this->runAction('reviews.detail', [], $draft['id'], 8, 12), 404);
        $this->denied(fn () => $this->runAction('products.detail', [], $product->id, 7, 12), 404);
        $this->denied(fn () => $this->runAction('applications.submit', ['expected_version' => 99], $draft['id']), 409);
        $submitted = $this->submit($draft);
        $this->denied(fn () => $this->runAction('applications.update', ['expected_version' => $submitted['version'], 'principal_minor' => 1, 'first_due_date' => '2026-11-01', 'purpose' => 'Changed'], $draft['id']), 409);
        $this->denied(fn () => $this->submit($submitted), 409);
        $this->updateProduct($product, ['status' => Product::Disabled]);
        $decision = ['expected_version' => $submitted['version'], 'decision' => Application::Approved, 'decision_note' => 'Checked'];
        $this->denied(fn () => $this->runAction('reviews.decide', $decision, $draft['id'], 8), 403);
        $this->denied(fn () => $this->application($product), 403);
        $rejected = $this->runAction('reviews.decide', [...$decision, 'decision' => Application::Rejected], $draft['id'], 8)['application'];
        $this->assertSame(Application::Rejected, $rejected['status']);
        $this->denied(fn () => $this->runAction('reviews.decide', [...$decision, 'expected_version' => $rejected['version']], $draft['id'], 8), 409);
        $this->updateProduct($product);
        $second = $this->application($product);
        $withdrawn = $this->runAction('applications.withdraw', ['expected_version' => $second['version']], $second['id'])['application'];
        $this->assertNotNull($withdrawn['withdrawn_at']);
        $third = $this->submit($this->application($product));
        $this->travelTo(CarbonImmutable::parse('2026-11-02', 'UTC'));
        $this->denied(fn () => $this->runAction('reviews.decide', [...$decision, 'expected_version' => $third['version']], $third['id'], 8), 422);
        $this->assertSame(Application::Submitted, Application::findOrFail($third['id'])->status);
        $this->denied(fn () => $this->application($product), 422);
        $this->denied(fn () => $this->runAction('applications.create', ['product_id' => $product->id, 'principal_minor' => 1000001, 'first_due_date' => '2026-12-01', 'purpose' => 'X']), 422);
        $this->assertSame(0, $this->runAction('products.list', [], null, 7, 12)['meta']['total']);
    }

    public function test_strict_validation_uniqueness_and_bounded_math(): void
    {
        $product = $this->product();
        $this->invalid(fn () => $this->runAction('products.create', $this->productInput()));
        $this->invalid(fn () => $this->runAction('products.list', ['page' => '01']));
        $this->invalid(fn () => $this->runAction('products.list', ['sql' => 'SELECT 1']));
        $this->invalid(fn () => $this->runAction('products.create', [...$this->productInput(), 'code' => 'different', 'term_rate_denominator' => 0]));
        $this->denied(fn () => $this->updateProduct($product, ['installment_count' => 120, 'interval_days' => 365]), 422);
        $this->denied(fn () => $this->updateProduct($product, ['expected_version' => 999]), 409);
        $this->invalid(fn () => $this->runAction('applications.create', ['product_id' => $product->id, 'principal_minor' => '100', 'first_due_date' => '2026-02-30', 'purpose' => 'X']));
        $schedule = app(LendingSchedule::class);
        $terms = ['principal_minor' => 1000000000, 'term_rate_numerator' => 1000000, 'term_rate_denominator' => 1000000, 'installment_count' => 120, 'interval_days' => 30, 'first_due_date' => '2028-02-29'];
        $maximum = $schedule->build($terms);
        $this->assertSame(2000000000, $maximum['total_minor']);
        $this->assertSame(2000000000, array_sum(array_column($maximum['installments'], 'total_minor')));
        $this->invalid(fn () => $schedule->build([...$terms, 'term_rate_numerator' => 1000001]));
        $this->denied(fn () => $schedule->build([...$terms, 'interval_days' => 365]), 422);
        $this->denied(fn () => $schedule->build([...$terms, 'first_due_date' => '9999-12-31']), 422);
        $this->invalid(fn () => $schedule->build([...$terms, 'first_due_date' => '2026-02-30']));
        foreach ([1, 2, 3, 7, 101] as $principal) {
            foreach ([0, 1, 3] as $rate) {
                $result = $schedule->build([...$terms, 'principal_minor' => $principal, 'term_rate_numerator' => $rate, 'term_rate_denominator' => 3, 'installment_count' => 7]);
                $this->assertSame($principal, array_sum(array_column($result['installments'], 'principal_minor')));
                $this->assertSame($result['charge_minor'], array_sum(array_column($result['installments'], 'charge_minor')));
                $this->assertSame($result['total_minor'], array_sum(array_column($result['installments'], 'total_minor')));
            }
        }
        foreach ([Product::class, Application::class] as $model) {
            $this->assertNotEmpty($model::options());
            $this->assertNotEmpty($model::factory()->make()->toArray());
        }
    }

    public function test_signed_handler_replay_denial_retry_and_scope_validation(): void
    {
        $message = $this->message('products.list');
        $this->assertNull(AuthorizedLendingScope::fromVerifiedExchange($message, fn (): bool => false));
        $this->invalid(fn () => AuthorizedLendingScope::fromVerifiedExchange([...$message, 'source' => 'crm'], fn (): bool => true));
        try {
            AuthorizedLendingScope::fromVerifiedExchange($message, fn (): int => 1);
            $this->fail();
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
        try {
            app(LendingActions::class)->execute(AuthorizedLendingScope::fromVerifiedExchange($message, fn (): bool => true), []);
            $this->fail();
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
        $transport = new ServiceTransport('https://platform.test', str_repeat('k', 32), 'lending', 'platform');
        $allowed = true;
        Http::fake(function ($request) use (&$allowed) {
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => $allowed]);

            return Http::response($body, 200, ['Content-Type' => 'application/json', 'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('k', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
        $exchange = new ServiceExchange;
        $handler = new LendingCommandHandler($exchange, $transport, app(LendingActions::class));
        $product = $this->product();
        foreach ([['products.list', [], null, 200], ['products.detail', [], 999, 404], ['products.create', [], null, 422], ['products.create', [...$this->productInput(), 'code' => 'durable-product'], null, 201], ['applications.submit', ['expected_version' => 99], $this->application($product)['id'], 409]] as [$action, $input, $id, $status]) {
            $message = $this->message($action, $input, $id);
            $exchange->accept($message, 'platform', 'lending');
            $this->assertTrue($handler->consumeOne());
            $exchange->accept($message, 'platform', 'lending');
            $this->assertFalse($handler->consumeOne());
            $this->assertSame($status, json_decode(ServiceDelivery::orderByDesc('id')->firstOrFail()->envelope, true)['payload']['http_status']);
        }
        $before = Product::count();
        $allowed = false;
        $exchange->accept($this->message('products.create', [...$this->productInput(), 'code' => 'revoked']), 'platform', 'lending');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame($before, Product::count());
        $allowed = true;
        Product::creating(fn () => abort(503));
        $exchange->accept($this->message('products.create', [...$this->productInput(), 'code' => 'retry']), 'platform', 'lending');
        $this->assertTrue($handler->consumeOne());
        Product::flushEventListeners();
    }
}
