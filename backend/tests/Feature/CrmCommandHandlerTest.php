<?php

namespace Tests\Feature;

use App\Modules\Crm\CrmActions;
use App\Modules\Crm\CrmCommandHandler;
use App\Modules\Crm\Models\Company;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class CrmCommandHandlerTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/crm', '--force' => true]);
    }

    private function command(string $action, array $input, ?int $id = null): array
    {
        $command = ['operation_id' => (string) Str::uuid(), 'input' => $input];
        if ($id !== null) {
            $command['id'] = $id;
        }

        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'crm',
            'topic' => 'crm.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 17, 'organization_id' => 9,
                'application' => 'crm', 'action' => $action, 'auth_version' => 1, 'token_id' => 29],
                'command' => $command]];
    }

    private function accept(ServiceExchange $exchange, array $envelope): void
    {
        $this->assertSame('accepted', $exchange->accept($envelope, 'platform', 'crm')['status']);
    }

    private function responseEnvelope(array $envelope): array
    {
        $row = DB::table('service_deliveries')->where('source', 'crm')->where('message_id', $envelope['id'])->firstOrFail();
        $this->assertSame('queued', $row->status);

        return json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR);
    }

    public function test_worker_authorizes_before_effect_commits_business_and_correlated_result_atomically(): void
    {
        $key = str_repeat('s', 64);
        $allowed = true;
        Http::fake(function ($request) use ($key, &$allowed) {
            $body = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $reply = json_encode(['nonce' => $body['nonce'], 'allowed' => $allowed], JSON_THROW_ON_ERROR);
            $nonce = $request->header('X-Service-Nonce')[0];

            return Http::response($reply, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt($key, $nonce, $reply)]);
        });
        $exchange = app(ServiceExchange::class);
        $handler = new CrmCommandHandler($exchange, new ServiceTransport('https://platform.example/internal', $key, 'crm', 'platform'), app(CrmActions::class));

        $create = $this->command('crm.companies.create', ['code' => 'acme', 'name' => 'Acme']);
        $this->accept($exchange, $create);
        $this->assertTrue($handler->consumeOne());
        $response = $this->responseEnvelope($create);
        $this->assertSame(['source' => 'crm', 'destination' => 'platform', 'topic' => 'crm.result', 'version' => 1],
            array_intersect_key($response, array_flip(['source', 'destination', 'topic', 'version'])));
        $this->assertSame($create['id'], $response['id']);
        $this->assertSame($create['payload']['command']['operation_id'], $response['payload']['operation_id']);
        $this->assertSame($create['id'], $response['payload']['command_id']);
        $this->assertSame(201, $response['payload']['http_status']);
        $companyId = $response['payload']['result']['company']['id'];
        $this->assertSame(9, DB::table('crm_companies')->where('id', $companyId)->value('organization_id'));
        $this->assertSame(17, DB::table('crm_companies')->where('id', $companyId)->value('created_by_platform_user_id'));

        $duplicate = $this->command('crm.companies.create', ['code' => 'ACME', 'name' => 'Duplicate']);
        $this->accept($exchange, $duplicate);
        $this->assertTrue($handler->consumeOne());
        $duplicateResult = $this->responseEnvelope($duplicate)['payload'];
        $this->assertSame(422, $duplicateResult['http_status']);
        $this->assertArrayHasKey('code', $duplicateResult['result']['validation_error']);
        $this->assertSame(1, DB::table('crm_companies')->count());

        $missing = $this->command('crm.companies.detail', [], 9999);
        $this->accept($exchange, $missing);
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(404, $this->responseEnvelope($missing)['payload']['http_status']);

        $stale = $this->command('crm.companies.update', ['name' => 'Stale', 'expected_version' => 1], $companyId);
        $this->accept($exchange, $stale);
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(409, $this->responseEnvelope($stale)['payload']['http_status']);
        $this->assertSame('Acme', DB::table('crm_companies')->where('id', $companyId)->value('name'));

        $allowed = false;
        $denied = $this->command('crm.companies.create', ['code' => 'denied', 'name' => 'Denied']);
        $this->accept($exchange, $denied);
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('failed', DB::table('service_inboxes')->where('message_id', $denied['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $denied['id'])->first());
        $this->assertSame(1, DB::table('crm_companies')->count());
        $this->assertFalse($handler->consumeOne());

        $allowed = true;
        Company::creating(fn () => abort(503, 'CRM dependency unavailable.'));
        $transient = $this->command('crm.companies.create', ['code' => 'retry', 'name' => 'Retry']);
        $this->accept($exchange, $transient);
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('queued', DB::table('service_inboxes')->where('message_id', $transient['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $transient['id'])->first());
        $this->assertSame(1, DB::table('crm_companies')->count());
    }
}
