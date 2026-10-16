<?php

namespace Tests\Feature;

use App\Models\ServiceDelivery;
use App\Models\ServiceInbox;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use App\Modules\Platform\Services\ServiceWorker;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ServiceExchangeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (! Schema::hasTable('service_inboxes')) {
            (require database_path('migrations/2026_10_13_015300_create_service_exchange_tables.php'))->up();
        }
        foreach (['service_request_nonces', 'service_inboxes', 'service_deliveries'] as $table) {
            DB::table($table)->delete();
        }
    }

    protected function tearDown(): void
    {
        foreach (['service_request_nonces', 'service_inboxes', 'service_deliveries'] as $table) {
            DB::table($table)->delete();
        }
        parent::tearDown();
    }

    private function envelope(): array
    {
        return json_decode(ServiceDelivery::factory()->make()->envelope, true);
    }

    private function transport(): ServiceTransport
    {
        return new ServiceTransport('https://crm.test/v1/services', str_repeat('a', 32));
    }

    public function test_acceptance_replay_returns_same_receipt_and_reserves_deleted_identity(): void
    {
        $exchange = new ServiceExchange;
        $message = $this->envelope();
        $receipt = $exchange->accept($message, 'platform', 'crm');
        $this->assertSame($receipt, $exchange->accept($message, 'platform', 'crm'));
        $this->assertDatabaseCount('service_inboxes', 1);
        ServiceInbox::first()->delete();
        $this->expectException(\DomainException::class);
        $exchange->accept($message, 'platform', 'crm');
    }

    public function test_changed_replay_is_rejected_without_overwriting_accepted_work(): void
    {
        $exchange = new ServiceExchange;
        $message = $this->envelope();
        $receipt = $exchange->accept($message, 'platform', 'crm');
        $message['payload'] = ['organization' => 2];
        try {
            $exchange->accept($message, 'platform', 'crm');
            $this->fail('Conflicting payload accepted.');
        } catch (\DomainException) {
            $this->assertDatabaseHas('service_inboxes', ['digest' => $receipt['digest']]);
        }
    }

    public function test_source_and_destination_are_bound_to_authenticated_configuration(): void
    {
        foreach ([['forged', 'crm'], ['platform', 'erp']] as [$source, $destination]) {
            try {
                (new ServiceExchange)->accept($this->envelope(), $source, $destination);
                $this->fail('Foreign message accepted.');
            } catch (\DomainException) {
                $this->assertDatabaseCount('service_inboxes', 0);
            }
        }
    }

    public function test_outbox_rolls_back_with_business_effect_and_requires_transaction(): void
    {
        $exchange = new ServiceExchange;
        DB::beginTransaction();
        $exchange->enqueue($this->envelope());
        DB::rollBack();
        $this->assertDatabaseCount('service_deliveries', 0);
        $this->expectException(\LogicException::class);
        $exchange->enqueue($this->envelope());
    }

    public function test_nested_inbox_acceptance_cannot_acknowledge_uncommitted_work(): void
    {
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => (new ServiceExchange)->accept($this->envelope(), 'platform', 'crm'));
    }

    public function test_relay_requires_matching_durable_receipt_and_recovers_lost_acknowledgment(): void
    {
        Http::preventStrayRequests();
        $message = $this->envelope();
        $exchange = new ServiceExchange;
        DB::transaction(fn () => $exchange->enqueue($message));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => fn ($request) => $this->signedResponse($request, ['status' => 'accepted'], 202)]);
        $this->assertTrue($exchange->relay($this->transport(), 'crm'));
        $this->assertDatabaseHas('service_deliveries', ['status' => 'queued', 'attempts' => 1]);
        $this->travel(3)->seconds();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => function ($request) use ($exchange) {
            $this->assertSame(0, DB::transactionLevel());

            return $this->signedResponse($request, $exchange->accept($request->data(), 'platform', 'crm'), 202);
        }]);
        $exchange->relay($this->transport(), 'crm');
        $this->assertDatabaseHas('service_deliveries', ['status' => 'succeeded', 'attempts' => 2]);
        $this->assertDatabaseCount('service_inboxes', 1);
        $this->assertFalse($exchange->relay($this->transport(), 'crm'));
    }

    public function test_expired_lease_replays_committed_inbox_and_fences_old_sender(): void
    {
        Http::preventStrayRequests();
        $row = ServiceDelivery::factory()->create(['status' => 'processing', 'lease' => fake()->uuid(),
            'lease_until' => now()->subSecond(), 'attempts' => 1]);
        $exchange = new ServiceExchange;
        $receipt = $exchange->accept(json_decode($row->envelope, true), 'platform', 'crm');
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => fn ($request) => $this->signedResponse($request, $receipt, 202)]);
        $exchange->relay($this->transport(), 'crm');
        $this->assertDatabaseHas('service_deliveries', ['id' => $row->id, 'status' => 'succeeded']);
        $this->assertDatabaseCount('service_inboxes', 1);
        Http::assertSentCount(1);
    }

    public function test_final_attempt_and_expired_final_lease_become_dead_letters(): void
    {
        Http::preventStrayRequests();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => Http::response('', 503)]);
        ServiceDelivery::factory()->create(['attempts' => 4]);
        ServiceDelivery::factory()->create(['status' => 'processing', 'attempts' => 5, 'lease_until' => now()->subSecond()]);
        (new ServiceExchange)->relay($this->transport(), 'crm');
        $this->assertSame(2, ServiceDelivery::where('status', 'failed')->count());
        Http::assertSentCount(1);
    }

    public function test_invalid_schema_identifier_and_oversized_message_never_enter_inbox(): void
    {
        foreach ([['version' => 2], ['extra' => true], ['id' => 'invalid'], ['payload' => null],
            ['topic' => '../secret'], ['payload' => ['text' => str_repeat('x', 65537)]]] as $change) {
            try {
                (new ServiceExchange)->accept([...$this->envelope(), ...$change], 'platform', 'crm');
                $this->fail('Invalid envelope accepted.');
            } catch (\InvalidArgumentException) {
                $this->assertDatabaseCount('service_inboxes', 0);
            }
        }
    }

    public function test_credentials_never_follow_redirects_and_authority_is_checked_fresh(): void
    {
        Http::preventStrayRequests();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/authorize' => function ($request) {
            return $this->signedResponse($request, ['nonce' => $request['nonce'], 'allowed' => true], 200);
        }]);
        $this->assertTrue($this->transport()->authorize(['organization' => 1]));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/authorize' => fn ($request) => $this->signedResponse($request, ['nonce' => 'stale', 'allowed' => true], 200)]);
        $this->assertFalse($this->transport()->authorize(['organization' => 1]));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/authorize' => Http::response('', 302, ['Location' => 'https://foreign.test'])]);
        $this->expectException(\RuntimeException::class);
        $this->transport()->authorize(['organization' => 1]);
    }

    public function test_unsafe_service_configuration_is_rejected(): void
    {
        foreach (['http://crm.test', 'https://user:pass@crm.test', 'https://crm.test?token=x', 'https://crm.test#fragment'] as $url) {
            try {
                new ServiceTransport($url, str_repeat('a', 32));
                $this->fail('Unsafe endpoint accepted.');
            } catch (\InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
        $this->expectException(\InvalidArgumentException::class);
        new ServiceTransport('https://crm.test', 'short');
    }

    public function test_transport_and_relay_refuse_network_inside_business_transaction(): void
    {
        Http::preventStrayRequests();
        foreach ([fn () => $this->transport()->authorize([]), fn () => (new ServiceExchange)->relay($this->transport(), 'crm')] as $call) {
            try {
                DB::transaction($call);
                $this->fail('Network transaction accepted.');
            } catch (\LogicException) {
                Http::assertNothingSent();
            }
        }
        $this->assertSame(ServiceDelivery::options(), ServiceInbox::options());
        $this->assertArrayNotHasKey('envelope', ServiceInbox::factory()->make()->toArray());
    }

    public function test_inbox_effect_and_completion_commit_once_and_recheck_revoked_authority(): void
    {
        $exchange = new ServiceExchange;
        $exchange->accept($this->envelope(), 'platform', 'crm');
        $authorize = function (): bool {
            $this->assertSame(0, DB::transactionLevel());

            return true;
        };
        $effect = function (): void {
            $this->assertGreaterThan(0, DB::transactionLevel());
            ServiceDelivery::factory()->create();
        };
        $this->assertTrue($exchange->consume('crm', $authorize, $effect));
        $this->assertFalse($exchange->consume('crm', $authorize, $effect));
        $exchange->accept($this->envelope(), 'platform', 'crm');
        $exchange->consume('crm', fn () => false, $effect);
        $this->assertDatabaseCount('service_deliveries', 1);
        $this->assertSame(1, ServiceInbox::where('status', 'failed')->count());
        $this->assertSame(1, ServiceInbox::where('status', 'succeeded')->count());
    }

    public function test_failed_effect_rolls_back_and_unavailable_authority_retries_to_dead_letter(): void
    {
        $exchange = new ServiceExchange;
        $exchange->accept($this->envelope(), 'platform', 'crm');
        $exchange->consume('crm', fn () => true, function (): void {
            ServiceDelivery::factory()->create();
            throw new \RuntimeException('Crash before commit.');
        });
        $this->assertDatabaseCount('service_deliveries', 0);
        $this->assertDatabaseHas('service_inboxes', ['status' => 'queued', 'attempts' => 1]);
        ServiceInbox::query()->update(['attempts' => 4, 'available_at' => now()]);
        $exchange->consume('crm', fn () => throw new \RuntimeException('Authority unavailable.'), fn () => $this->fail('Unauthorized effect.'));
        $this->assertDatabaseHas('service_inboxes', ['status' => 'failed', 'attempts' => 5]);
    }

    public function test_worker_losing_lease_during_authorization_cannot_commit(): void
    {
        $exchange = new ServiceExchange;
        $exchange->accept($this->envelope(), 'platform', 'crm');
        $exchange->consume('crm', function (): bool {
            ServiceInbox::query()->update(['lease' => fake()->uuid()]);

            return true;
        }, fn () => $this->fail('Stale worker committed.'));
        $this->assertDatabaseHas('service_inboxes', ['status' => 'processing']);
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => $exchange->consume('crm', fn () => true, fn () => null));
    }

    public function test_postgresql_worker_skips_inbox_locked_by_another_database_session(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->assertSame('sqlite', DB::getDriverName());

            return;
        }
        $exchange = new ServiceExchange;
        $exchange->accept($this->envelope(), 'platform', 'crm');
        config(['database.connections.service_lock_test' => config('database.connections.pgsql')]);
        $other = DB::connection('service_lock_test');
        $other->beginTransaction();
        try {
            $other->table('service_inboxes')->lockForUpdate()->first();
            $this->assertFalse($exchange->consume('crm', fn () => true, fn () => $this->fail('Locked work executed.')));
        } finally {
            $other->rollBack();
            DB::purge('service_lock_test');
        }
        $this->assertTrue($exchange->consume('crm', fn () => true, fn () => ServiceDelivery::factory()->create()));
        $this->assertDatabaseCount('service_deliveries', 1);
    }

    private function signedResponse(Request $request, array $body, int $status): PromiseInterface
    {
        $json = json_encode($body);

        return Http::response($json, $status, ['Content-Type' => 'application/json',
            'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('a', 32), $request->header('X-Service-Nonce')[0], $json)]);
    }

    public function test_terminal_remote_authorization_rejection_is_not_retried(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => Http::response('', 403)]);
        ServiceDelivery::factory()->create();
        $exchange = new ServiceExchange;
        $exchange->relay($this->transport(), 'crm');
        $this->assertDatabaseHas('service_deliveries', ['status' => 'failed', 'attempts' => 1]);
        $this->assertFalse($exchange->relay($this->transport(), 'crm'));
        Http::assertSentCount(1);
    }

    public function test_source_filtered_turn_cannot_be_starved_by_another_peer(): void
    {
        $exchange = new ServiceExchange;
        foreach (['crm', 'crm', 'helpdesk'] as $source) {
            $message = [...$this->envelope(), 'source' => $source, 'destination' => 'platform'];
            $exchange->accept($message, $source, 'platform');
        }
        $seen = [];
        $this->assertTrue($exchange->consume('platform', fn (): bool => true,
            function (array $message) use (&$seen): void {
                $seen[] = $message['source'];
            }, 'helpdesk'));
        $this->assertSame(['helpdesk'], $seen);
        $this->assertSame(2, ServiceInbox::where('source', 'crm')->where('status', 'queued')->count());
        $this->assertFalse($exchange->consume('platform', fn (): bool => true, fn () => null, 'helpdesk'));
    }

    public function test_health_roundtrip_is_consumed_by_workers_without_business_authority(): void
    {
        $key = str_repeat('a', 32);
        config(['platform.service_names' => ['crm'], 'service_exchange.enabled' => true,
            'service_exchange.name' => 'crm', 'service_exchange.peers.platform' => [
                'url' => 'https://crm.test/v1/services', 'key' => $key]]);
        $id = fake()->uuid();
        $nonce = fake()->uuid();
        $request = ['id' => $id, 'source' => 'platform', 'destination' => 'crm',
            'topic' => 'transport.health', 'version' => 1, 'payload' => ['nonce' => $nonce]];
        $exchange = new ServiceExchange;
        $exchange->accept($request, 'platform', 'crm');
        Http::preventStrayRequests();
        Http::fake(['https://crm.test/v1/services/inbox' => fn ($httpRequest) => $this->signedResponse($httpRequest,
            ['id' => $id, 'digest' => hash('sha256', json_encode([
                'id' => $id, 'source' => 'crm', 'destination' => 'platform',
                'topic' => 'transport.health', 'version' => 1, 'payload' => ['nonce' => $nonce]],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), 'status' => 'accepted'], 202)]);
        $this->assertTrue((new ServiceWorker)->processNext());
        $this->assertDatabaseHas('service_inboxes', ['message_id' => $id, 'source' => 'platform', 'status' => 'succeeded']);
        $this->assertDatabaseHas('service_deliveries', ['message_id' => $id, 'source' => 'crm', 'status' => 'succeeded']);
        $exchange->accept(['id' => $id, 'source' => 'crm', 'destination' => 'platform',
            'topic' => 'transport.health', 'version' => 1, 'payload' => ['nonce' => $nonce]], 'crm', 'platform');
        config(['service_exchange.name' => 'platform', 'service_exchange.peers.crm' => [
            'url' => 'https://crm.test/v1/services', 'key' => $key]]);
        $this->assertTrue((new ServiceWorker)->processNext());
        $this->assertDatabaseHas('service_inboxes', ['message_id' => $id, 'source' => 'crm', 'status' => 'succeeded']);
    }

    public function test_health_topic_does_not_enter_business_consumer_and_rejects_bad_payload(): void
    {
        $exchange = new ServiceExchange;
        $health = ['id' => fake()->uuid(), 'source' => 'platform', 'destination' => 'crm',
            'topic' => 'transport.health', 'version' => 1, 'payload' => ['nonce' => 'invalid']];
        $exchange->accept($health, 'platform', 'crm');
        $this->assertFalse($exchange->consume('crm', fn () => true, fn () => $this->fail('Health ran as business work.')));
        config(['platform.service_names' => ['crm'], 'service_exchange.enabled' => true,
            'service_exchange.name' => 'crm', 'service_exchange.peers.platform' => [
                'url' => 'https://crm.test/v1/services', 'key' => str_repeat('a', 32)]]);
        $this->assertTrue((new ServiceWorker)->processNext());
        $this->assertDatabaseHas('service_inboxes', ['message_id' => $health['id'], 'status' => 'failed']);
        $this->assertDatabaseCount('service_deliveries', 0);
    }
}
