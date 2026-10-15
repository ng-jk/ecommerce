<?php

namespace Tests\Feature;

use App\Modules\Erp\ErpActions;
use App\Modules\Erp\ErpCommandHandler;
use App\Modules\Erp\Models\Account;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class ErpCommandHandlerTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/erp', '--force' => true]);
    }

    private function command(string $action, array $input, ?int $id = null): array
    {
        $command = ['operation_id' => (string) Str::uuid(), 'input' => $input];
        if ($id !== null) {
            $command['id'] = $id;
        }

        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'erp',
            'topic' => 'erp.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 17, 'organization_id' => 9,
                'application' => 'erp', 'action' => $action, 'auth_version' => 1, 'token_id' => 29],
                'command' => $command]];
    }

    private function responseEnvelope(array $command): array
    {
        $row = DB::table('service_deliveries')->where('source', 'erp')->where('message_id', $command['id'])->firstOrFail();
        $this->assertSame('queued', $row->status);

        return json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR);
    }

    public function test_worker_fresh_authorization_correlated_results_rejection_and_retry(): void
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
        $handler = new ErpCommandHandler($exchange,
            new ServiceTransport('https://platform.example/internal', $key, 'erp', 'platform'),
            app(ErpActions::class));
        $create = $this->command('erp.accounts.create', ['code' => 'cash', 'name' => 'Cash', 'type' => 'asset']);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'erp')['status']);
        $this->assertTrue($handler->consumeOne());
        $reply = $this->responseEnvelope($create);
        $this->assertSame($create['id'], $reply['id']);
        $this->assertSame('erp.result', $reply['topic']);
        $this->assertSame(201, $reply['payload']['http_status']);
        $this->assertSame($create['payload']['command']['operation_id'], $reply['payload']['operation_id']);
        $this->assertSame(9, $reply['payload']['organization_id']);
        $accountId = $reply['payload']['result']['account']['id'];
        $this->assertSame(17, DB::table('erp_accounts')->where('id', $accountId)->value('created_by_platform_user_id'));

        foreach ([
            $this->command('erp.accounts.create', ['code' => 'cash', 'name' => 'Duplicate', 'type' => 'asset']),
            $this->command('erp.accounts.detail', [], 9999),
            $this->command('erp.accounts.update', ['name' => 'Stale', 'expected_version' => 4], $accountId),
        ] as $index => $command) {
            $exchange->accept($command, 'platform', 'erp');
            $this->assertTrue($handler->consumeOne());
            $this->assertSame([422, 404, 409][$index], $this->responseEnvelope($command)['payload']['http_status']);
        }
        $this->assertSame(1, DB::table('erp_accounts')->count());

        $allowed = false;
        $denied = $this->command('erp.accounts.create', ['code' => 'denied', 'name' => 'Denied', 'type' => 'asset']);
        $exchange->accept($denied, 'platform', 'erp');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('failed', DB::table('service_inboxes')->where('message_id', $denied['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $denied['id'])->first());
        $this->assertFalse($handler->consumeOne());

        $allowed = true;
        Account::creating(fn () => abort(503, 'ERP dependency unavailable.'));
        $transient = $this->command('erp.accounts.create', ['code' => 'retry', 'name' => 'Retry', 'type' => 'asset']);
        $exchange->accept($transient, 'platform', 'erp');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('queued', DB::table('service_inboxes')->where('message_id', $transient['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $transient['id'])->first());
        $this->assertSame(1, DB::table('erp_accounts')->count());
    }
}
