<?php

namespace Tests\Feature;

use App\Models\ServiceDelivery;
use App\Modules\Lending\AuthorizedLendingScope;
use App\Modules\Lending\LendingActions;
use App\Modules\Lending\LendingCommandHandler;
use App\Modules\Lending\Models\LendingProduct;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PDOException;
use Tests\TestCase;

class LendingProductCodeRaceTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
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

    private function message(): array
    {
        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'lending',
            'topic' => 'lending.command', 'version' => 1, 'payload' => [
                'scope' => ['organization_id' => 11, 'platform_user_id' => 7, 'token_id' => 1,
                    'auth_version' => 0, 'application' => 'lending', 'action' => 'lending.products.create'],
                'command' => ['operation_id' => (string) Str::uuid(), 'input' => $this->input()],
            ]];
    }

    private function scope(): AuthorizedLendingScope
    {
        return AuthorizedLendingScope::fromVerifiedExchange($this->message(), fn (): bool => true);
    }

    private function input(): array
    {
        return ['code' => 'contended-code', 'name' => 'Product', 'jurisdiction_label' => 'Operator scope',
            'terms_text' => 'Whole-term charge', 'currency' => 'MYR', 'minor_unit_digits' => 2,
            'principal_min_minor' => 1, 'principal_max_minor' => 1000, 'term_rate_numerator' => 1,
            'term_rate_denominator' => 10, 'installment_count' => 3, 'interval_days' => 30];
    }

    public function test_product_code_constraint_race_returns_field_validation_and_keeps_transaction_usable(): void
    {
        $input = $this->input();
        LendingProduct::creating(function (LendingProduct $product): void {
            // The pre-insert Rule::unique check has passed. This competing row wins the unique key.
            DB::table('lending_products')->insert($product->getAttributes());
        });
        try {
            DB::transaction(function () use ($input): void {
                try {
                    app(LendingActions::class)->execute($this->scope(), $input);
                    $this->fail('Expected the contended code to be rejected.');
                } catch (ValidationException $error) {
                    $this->assertArrayHasKey('code', $error->errors());
                }
                // The worker must still be able to write its terminal response here.
                $this->assertSame(0, LendingProduct::count());
            });
        } finally {
            LendingProduct::flushEventListeners();
        }
        $this->assertSame(0, LendingProduct::count());
        $created = DB::transaction(fn () => app(LendingActions::class)->execute($this->scope(), $input));
        $this->assertSame('contended-code', $created['product']['code']);
    }

    public function test_worker_persists_terminal_422_result_for_contended_code(): void
    {
        LendingProduct::creating(function (LendingProduct $product): void {
            DB::table('lending_products')->insert($product->getAttributes());
        });
        $message = $this->message();
        $key = str_repeat('k', 32);
        Http::fake(function ($request) use ($key) {
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => true]);

            return Http::response($body, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt($key, $request->header('X-Service-Nonce')[0], $body)]);
        });
        try {
            $exchange = new ServiceExchange;
            $exchange->accept($message, 'platform', 'lending');
            $handler = new LendingCommandHandler($exchange,
                new ServiceTransport('https://platform.test', $key, 'lending', 'platform'), app(LendingActions::class));
            $this->assertTrue($handler->consumeOne());
            $payload = json_decode(ServiceDelivery::where('message_id', $message['id'])->firstOrFail()->envelope, true)['payload'];
            $this->assertSame(422, $payload['http_status']);
            $this->assertArrayHasKey('code', $payload['result']['validation_error']);
        } finally {
            LendingProduct::flushEventListeners();
        }
    }

    public function test_unrelated_database_failure_is_not_reported_as_duplicate_code(): void
    {
        LendingProduct::creating(fn () => throw new QueryException('sqlite', 'insert', [], new PDOException('Storage unavailable', 999)));
        try {
            $this->expectException(QueryException::class);
            DB::transaction(fn () => app(LendingActions::class)->execute($this->scope(), $this->input()));
        } finally {
            LendingProduct::flushEventListeners();
        }
    }
}
