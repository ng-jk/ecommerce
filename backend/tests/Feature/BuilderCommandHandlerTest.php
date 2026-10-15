<?php

namespace Tests\Feature;

use App\Modules\Builder\BuilderActions;
use App\Modules\Builder\BuilderCommandHandler;
use App\Modules\Builder\Models\Page;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class BuilderCommandHandlerTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/builder', '--force' => true]);
    }

    private function command(string $action, array $input, ?int $id = null): array
    {
        $command = ['operation_id' => (string) Str::uuid(), 'input' => $input];
        if ($id !== null) {
            $command['id'] = $id;
        }

        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'builder',
            'topic' => 'builder.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 17, 'organization_id' => 9,
                'application' => 'builder', 'action' => $action, 'auth_version' => 1, 'token_id' => 29],
                'command' => $command]];
    }

    private function responseEnvelope(array $command): array
    {
        $row = DB::table('service_deliveries')->where('source', 'builder')->where('message_id', $command['id'])->firstOrFail();
        $this->assertSame('queued', $row->status);

        return json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR);
    }

    public function test_worker_authorizes_before_effect_and_emits_correlated_result(): void
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
        $handler = new BuilderCommandHandler($exchange,
            new ServiceTransport('https://platform.example/internal', $key, 'builder', 'platform'),
            app(BuilderActions::class));
        $create = $this->command('builder.pages.create', ['slug' => 'home', 'title' => 'Home', 'blocks' => []]);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'builder')['status']);
        $this->assertTrue($handler->consumeOne());
        $reply = $this->responseEnvelope($create);
        $this->assertSame($create['id'], $reply['id']);
        $this->assertSame('builder.result', $reply['topic']);
        $this->assertSame($create['payload']['command']['operation_id'], $reply['payload']['operation_id']);
        $this->assertSame($create['id'], $reply['payload']['command_id']);
        $this->assertSame(9, $reply['payload']['organization_id']);
        $this->assertSame(201, $reply['payload']['http_status']);
        $pageId = $reply['payload']['result']['page']['id'];
        $this->assertSame(17, DB::table('builder_pages')->where('id', $pageId)->value('created_by_platform_user_id'));

        foreach ([
            $this->command('builder.pages.create', ['slug' => 'home', 'title' => 'Duplicate', 'blocks' => []]),
            $this->command('builder.pages.detail', [], 9999),
            $this->command('builder.pages.update', ['title' => 'Stale', 'blocks' => [], 'expected_version' => 4], $pageId),
        ] as $index => $command) {
            $exchange->accept($command, 'platform', 'builder');
            $this->assertTrue($handler->consumeOne());
            $this->assertSame([422, 404, 409][$index], $this->responseEnvelope($command)['payload']['http_status']);
        }
        $this->assertSame(1, DB::table('builder_pages')->count());

        $allowed = false;
        $denied = $this->command('builder.pages.create', ['slug' => 'denied', 'title' => 'Denied', 'blocks' => []]);
        $exchange->accept($denied, 'platform', 'builder');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('failed', DB::table('service_inboxes')->where('message_id', $denied['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $denied['id'])->first());
        $this->assertFalse($handler->consumeOne());

        $allowed = true;
        Page::creating(fn () => abort(503, 'Builder dependency unavailable.'));
        $transient = $this->command('builder.pages.create', ['slug' => 'retry', 'title' => 'Retry', 'blocks' => []]);
        $exchange->accept($transient, 'platform', 'builder');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('queued', DB::table('service_inboxes')->where('message_id', $transient['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $transient['id'])->first());
        $this->assertSame(1, DB::table('builder_pages')->count());
    }
}
