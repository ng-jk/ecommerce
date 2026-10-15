<?php

namespace Tests\Feature;

use App\Modules\Helpdesk\HelpdeskActions;
use App\Modules\Helpdesk\HelpdeskCommandHandler;
use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskTicket;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class HelpdeskCommandHandlerTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/helpdesk', '--force' => true]);
    }

    private function command(string $action, array $input, ?int $id = null, ?int $subject = null): array
    {
        $command = ['operation_id' => (string) Str::uuid(), 'input' => $input];
        if ($id !== null) {
            $command['id'] = $id;
        }
        $scope = ['platform_user_id' => 17, 'organization_id' => 9,
            'application' => 'helpdesk', 'action' => $action, 'auth_version' => 1, 'token_id' => 29];
        if ($subject !== null) {
            $scope['subject_platform_user_id'] = $subject;
        }

        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'helpdesk',
            'topic' => 'helpdesk.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => $command]];
    }

    private function response(array $command): array
    {
        $row = DB::table('service_deliveries')->where('source', 'helpdesk')
            ->where('message_id', $command['id'])->firstOrFail();
        $this->assertSame('queued', $row->status);

        return json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR);
    }

    public function test_full_unicode_ticket_page_fits_result_envelope_without_descriptions(): void
    {
        $key = str_repeat('h', 64);
        Http::fake(function ($request) use ($key) {
            $body = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $reply = json_encode(['nonce' => $body['nonce'], 'allowed' => true], JSON_THROW_ON_ERROR);

            return Http::response($reply, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt($key, $request->header('X-Service-Nonce')[0], $reply)]);
        });
        $queue = HelpdeskQueue::create(['organization_id' => 9, 'code' => 'support', 'name' => 'Support']);
        for ($i = 0; $i < 20; $i++) {
            HelpdeskTicket::create(['organization_id' => 9, 'queue_id' => $queue->id,
                'requester_platform_user_id' => 17, 'subject' => str_repeat('😀', 200), 'description' => str_repeat('x', 10000)]);
        }
        $exchange = app(ServiceExchange::class);
        $handler = new HelpdeskCommandHandler($exchange,
            new ServiceTransport('https://platform.example/internal', $key, 'helpdesk', 'platform'), app(HelpdeskActions::class));
        $command = $this->command('helpdesk.tickets.owner.list', ['per_page' => 20]);
        $exchange->accept($command, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $response = $this->response($command);
        $this->assertSame(200, $response['payload']['http_status']);
        $this->assertCount(20, $response['payload']['result']['data']);
        $this->assertArrayNotHasKey('description', $response['payload']['result']['data'][0]);
        $this->assertLessThanOrEqual(65536, strlen(json_encode($response, JSON_THROW_ON_ERROR)));
        $this->assertSame('succeeded', DB::table('service_inboxes')->where('message_id', $command['id'])->value('status'));
        $detail = $this->command('helpdesk.tickets.owner.detail', [], $response['payload']['result']['data'][0]['id']);
        $exchange->accept($detail, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(str_repeat('x', 10000), $this->response($detail)['payload']['result']['ticket']['description']);
    }

    public function test_worker_fences_authorization_effect_and_correlated_result_with_replay_safety(): void
    {
        $key = str_repeat('h', 64);
        $allowed = true;
        Http::fake(function ($request) use ($key, &$allowed) {
            $body = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $reply = json_encode(['nonce' => $body['nonce'], 'allowed' => $allowed], JSON_THROW_ON_ERROR);
            $nonce = $request->header('X-Service-Nonce')[0];

            return Http::response($reply, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt($key, $nonce, $reply)]);
        });
        $exchange = app(ServiceExchange::class);
        $handler = new HelpdeskCommandHandler($exchange,
            new ServiceTransport('https://platform.example/internal', $key, 'helpdesk', 'platform'),
            app(HelpdeskActions::class));

        $create = $this->command('helpdesk.queues.create', ['code' => 'general', 'name' => 'General']);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'helpdesk')['status']);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'helpdesk')['status']);
        $this->assertTrue($handler->consumeOne());
        $response = $this->response($create);
        $this->assertSame(['source' => 'helpdesk', 'destination' => 'platform', 'topic' => 'helpdesk.result', 'version' => 1],
            array_intersect_key($response, array_flip(['source', 'destination', 'topic', 'version'])));
        $this->assertSame($create['id'], $response['id']);
        $this->assertSame($create['payload']['command']['operation_id'], $response['payload']['operation_id']);
        $this->assertSame($create['id'], $response['payload']['command_id']);
        $this->assertSame(201, $response['payload']['http_status']);
        $queueId = $response['payload']['result']['queue']['id'];
        $this->assertSame(9, DB::table('helpdesk_queues')->where('id', $queueId)->value('organization_id'));
        $this->assertSame(1, DB::table('helpdesk_queues')->count());
        $this->assertFalse($handler->consumeOne());

        $duplicate = $this->command('helpdesk.queues.create', ['code' => 'GENERAL', 'name' => 'Duplicate']);
        $exchange->accept($duplicate, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(422, $this->response($duplicate)['payload']['http_status']);
        $this->assertArrayHasKey('code', $this->response($duplicate)['payload']['result']['validation_error']);

        $missing = $this->command('helpdesk.queues.detail', [], 9999);
        $exchange->accept($missing, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(404, $this->response($missing)['payload']['http_status']);

        $stale = $this->command('helpdesk.queues.update',
            ['name' => 'Stale', 'status' => 'active', 'expected_version' => 1], $queueId);
        $exchange->accept($stale, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(409, $this->response($stale)['payload']['http_status']);
        $this->assertSame('General', DB::table('helpdesk_queues')->where('id', $queueId)->value('name'));

        $allowed = false;
        $denied = $this->command('helpdesk.queues.create', ['code' => 'denied', 'name' => 'Denied']);
        $exchange->accept($denied, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('failed', DB::table('service_inboxes')->where('message_id', $denied['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $denied['id'])->first());
        $this->assertSame(1, DB::table('helpdesk_queues')->count());

        $allowed = true;
        HelpdeskQueue::creating(fn () => abort(503, 'Helpdesk dependency unavailable.'));
        $transient = $this->command('helpdesk.queues.create', ['code' => 'retry', 'name' => 'Retry']);
        $exchange->accept($transient, 'platform', 'helpdesk');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('queued', DB::table('service_inboxes')->where('message_id', $transient['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $transient['id'])->first());
        $this->assertSame(1, DB::table('helpdesk_queues')->count());
    }
}
