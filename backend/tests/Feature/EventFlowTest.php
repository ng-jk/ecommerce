<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Models\DomainEvent;
use App\Models\EventDelivery;
use App\Models\EventSubscription;
use App\Modules\Events\Data\EventStore;
use App\Modules\Events\Interface\EventHandler;
use App\Modules\Events\Interface\Events;
use App\Modules\Events\Logic\EventBroker;
use App\Modules\Events\Logic\EventWorker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

final class RecordingEventHandler implements EventHandler
{
    public static int $calls = 0;

    public static bool $fail = false;

    public function handle(string $topic, array $payload, string $eventKey): void
    {
        self::$calls++;
        if (self::$fail) {
            throw new RuntimeException('Temporary subscriber failure.');
        }
        if ($topic !== 'order.placed' || $payload['order_id'] !== 42 || $eventKey !== 'order:42:placed') {
            throw new RuntimeException('Unexpected event.');
        }
    }
}

final class TransactionalEventHandler implements EventHandler
{
    public static bool $fail = false;

    public function handle(string $topic, array $payload, string $eventKey): void
    {
        $shopId = DB::table('shops')->insertGetId([
            'slug' => 'event-effect', 'name' => 'Event effect', 'created_at' => now(), 'updated_at' => now(),
        ]);
        app(Events::class)->publish('subscriber.effect', 'shop', $shopId, ['shop_id' => $shopId], $eventKey.':effect');
        if (self::$fail) {
            throw new RuntimeException('Fail after business effect and outbox publication.');
        }
    }
}

class EventFlowTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        RecordingEventHandler::$calls = 0;
        RecordingEventHandler::$fail = false;
        TransactionalEventHandler::$fail = false;
    }

    private function publish(): void
    {
        DB::transaction(fn () => app(Events::class)->publish('order.placed', 'order', 42,
            ['order_id' => 42], 'order:42:placed'));
    }

    public function test_rolled_back_business_transaction_leaves_no_event_or_delivery(): void
    {
        try {
            DB::transaction(function (): void {
                app(Events::class)->publish('order.placed', 'order', 42, ['order_id' => 42], 'order:42:placed');
                throw new RuntimeException('Rollback business action.');
            });
        } catch (RuntimeException) {
        }

        $this->assertDatabaseCount('domain_events', 0);
        $this->assertFalse(app(EventBroker::class)->processNext());
    }

    public function test_invalid_subscriber_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        app(Events::class)->subscribe('invalid', 'order.placed', \stdClass::class);
    }

    public function test_event_key_cannot_hide_conflicting_content(): void
    {
        $this->publish();
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => app(Events::class)->publish('order.placed', 'order', 42,
            ['order_id' => 43], 'order:42:placed'));
    }

    public function test_revoked_subscription_does_not_execute_queued_work(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        DB::table('event_subscriptions')->update(['active' => false]);
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertSame(0, RecordingEventHandler::$calls);
    }

    public function test_expired_owner_cannot_acknowledge_before_reclaim(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        $store = app(EventStore::class);
        $delivery = $store->claimNext();
        $this->assertNotNull($delivery);
        $this->travel(61)->seconds();
        $store->complete($delivery, true);
        $this->assertDatabaseHas('event_deliveries', ['id' => $delivery->id, 'status' => 'processing']);
    }

    public function test_lost_notification_is_recovered_by_scanning_and_duplicate_publication_is_idempotent(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        $this->publish();

        $this->assertDatabaseCount('domain_events', 1);
        $this->assertTrue(app(EventBroker::class)->processNext());
        $this->assertFalse(app(EventBroker::class)->processNext());
        $this->assertDatabaseCount('event_deliveries', 1);
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertFalse(app(EventWorker::class)->processNext());
        $this->assertSame(1, RecordingEventHandler::$calls);
        $this->assertDatabaseHas('event_deliveries', ['status' => 'succeeded', 'attempts' => 1]);
    }

    public function test_expired_lease_is_recovered_and_retry_is_bounded(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        DB::table('event_deliveries')->update(['status' => 'processing', 'lease' => '11111111-1111-4111-8111-111111111111',
            'lease_until' => now()->subSecond(), 'attempts' => 1]);

        RecordingEventHandler::$fail = true;
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertDatabaseHas('event_deliveries', ['status' => 'queued', 'attempts' => 2]);
        $this->assertFalse(app(EventWorker::class)->processNext());
        RecordingEventHandler::$fail = false;
        $this->travel(5)->seconds();
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertDatabaseHas('event_deliveries', ['status' => 'succeeded', 'attempts' => 3]);
    }

    public function test_expired_fifth_attempt_goes_to_dead_letter_without_invoking_handler(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        DB::table('event_deliveries')->update(['status' => 'processing', 'attempts' => 5,
            'lease' => '11111111-1111-4111-8111-111111111111', 'lease_until' => now()->subSecond()]);

        $this->assertFalse(app(EventWorker::class)->processNext());
        $this->assertSame(0, RecordingEventHandler::$calls);
        $this->assertDatabaseHas('event_deliveries', ['status' => 'failed', 'attempts' => 5]);
    }

    public function test_stale_worker_cannot_acknowledge_a_reclaimed_delivery(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        $store = app(EventStore::class);
        $stale = $store->claimNext();
        $this->assertNotNull($stale);
        DB::table('event_deliveries')->where('id', $stale->id)->update(['lease_until' => now()->subSecond()]);
        $fresh = $store->claimNext();
        $this->assertNotNull($fresh);
        $store->complete($stale, true);
        $this->assertDatabaseHas('event_deliveries', ['id' => $fresh->id, 'status' => 'processing', 'lease' => $fresh->lease]);
        $store->complete($fresh, true);
        $this->assertDatabaseHas('event_deliveries', ['id' => $fresh->id, 'status' => 'succeeded', 'attempts' => 2]);
    }

    public function test_terminal_operation_publishes_one_typed_completion_event(): void
    {
        DB::table('shops')->insert(['slug' => 'fashion', 'name' => 'Fashion', 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson('/api/v1/shops/fashion/products')->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->assertDatabaseHas('domain_events', ['topic' => 'operation.completed', 'aggregate_type' => 'operation']);
        $this->assertFalse(app(OperationProcessor::class)->processNext());
        $this->assertDatabaseCount('domain_events', 1);
    }

    public function test_handler_database_effects_and_outbox_roll_back_before_retry(): void
    {
        app(Events::class)->subscribe('transactional', 'order.placed', TransactionalEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        TransactionalEventHandler::$fail = true;

        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertDatabaseMissing('shops', ['slug' => 'event-effect']);
        $this->assertDatabaseMissing('domain_events', ['topic' => 'subscriber.effect']);
        $this->assertDatabaseHas('event_deliveries', ['status' => 'queued', 'attempts' => 1, 'completed_at' => null]);

        TransactionalEventHandler::$fail = false;
        $this->travel(3)->seconds();
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertSame(1, DB::table('shops')->where('slug', 'event-effect')->count());
        $this->assertSame(1, DB::table('domain_events')->where('topic', 'subscriber.effect')->count());
        $this->assertDatabaseHas('event_deliveries', ['status' => 'succeeded', 'attempts' => 2, 'lease' => null]);
        $this->assertFalse(app(EventWorker::class)->processNext());
    }

    public function test_expired_reclaimed_and_completed_owners_cannot_apply_effects(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        $store = app(EventStore::class);
        $stale = $store->claimNext();
        $this->assertNotNull($stale);
        $effects = 0;
        $effect = function () use (&$effects): void {
            $effects++;
            DB::table('shops')->insert([
                'slug' => 'owned-effect', 'name' => 'Owned effect', 'created_at' => now(), 'updated_at' => now(),
            ]);
        };

        $this->travel(61)->seconds();
        $store->runOwned($stale, $effect);
        $this->assertSame(0, $effects);
        $this->assertDatabaseMissing('shops', ['slug' => 'owned-effect']);
        $fresh = $store->claimNext();
        $this->assertNotNull($fresh);
        $this->assertNotSame($stale->lease, $fresh->lease);
        $store->runOwned($stale, $effect);
        $this->assertSame(0, $effects);
        $store->runOwned($fresh, $effect);
        $this->assertSame(1, $effects);
        $this->assertDatabaseHas('event_deliveries', ['id' => $fresh->id, 'status' => 'succeeded', 'attempts' => 2]);
        $store->runOwned($fresh, $effect);
        $this->assertSame(1, $effects);
        $this->assertSame(1, DB::table('shops')->where('slug', 'owned-effect')->count());
    }

    public function test_resubscribe_restores_existing_subscription_without_rewriting_creation_time(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $subscription = EventSubscription::query()->firstOrFail();
        $createdAt = $subscription->getRawOriginal('created_at');
        $id = $subscription->id;
        $subscription->delete();
        $this->assertNull(EventSubscription::query()->find($id));

        $this->travel(60)->seconds();
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $restored = EventSubscription::query()->findOrFail($id);
        $this->assertSame($createdAt, $restored->getRawOriginal('created_at'));
        $this->assertNotEquals($restored->created_at, $restored->updated_at);
        $this->assertTrue((bool) $restored->active);
        $this->assertNull($restored->deleted_at);
        $this->assertSame(1, EventSubscription::withTrashed()->count());
        $this->publish();
        $this->assertTrue(app(EventBroker::class)->processNext());
        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertSame(1, RecordingEventHandler::$calls);
    }

    public function test_event_models_hide_internal_fields_and_soft_delete_without_physical_removal(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        $store = app(EventStore::class);
        $claimed = $store->claimNext();
        $this->assertNotNull($claimed);
        $event = DomainEvent::query()->firstOrFail();
        $subscription = EventSubscription::query()->firstOrFail();
        $delivery = EventDelivery::query()->findOrFail($claimed->id);
        foreach (['payload', 'event_key', 'deleted_at'] as $field) {
            $this->assertArrayNotHasKey($field, $event->toArray());
        }
        foreach (['lease', 'lease_until', 'subscription_id', 'deleted_at'] as $field) {
            $this->assertArrayNotHasKey($field, $delivery->toArray());
        }
        $this->assertArrayNotHasKey('handler', $subscription->toArray());
        $event->delete();
        $subscription->delete();
        $delivery->delete();
        foreach ([DomainEvent::class, EventSubscription::class, EventDelivery::class] as $model) {
            $this->assertSame(0, $model::query()->count());
            $this->assertSame(1, $model::withTrashed()->count());
        }
        $this->assertNull($store->claimNext());
        $this->assertSame([null, null], $store->messageFor($claimed));
        $store->runOwned($claimed, function (): void {
            $this->fail('A soft-deleted delivery must never invoke its handler.');
        });
    }

    public function test_corrupt_handler_registration_retries_without_executing_effects(): void
    {
        app(Events::class)->subscribe('record', 'order.placed', RecordingEventHandler::class);
        $this->publish();
        app(EventBroker::class)->processNext();
        DB::table('event_subscriptions')->update(['handler' => \stdClass::class]);

        $this->assertTrue(app(EventWorker::class)->processNext());
        $this->assertSame(0, RecordingEventHandler::$calls);
        $this->assertDatabaseHas('event_deliveries', ['status' => 'queued', 'attempts' => 1]);
    }

    public function test_delivery_options_are_owned_by_the_model(): void
    {
        $this->assertSame([
            EventDelivery::Queued => 'Queued', EventDelivery::Processing => 'Processing',
            EventDelivery::Succeeded => 'Succeeded', EventDelivery::Failed => 'Failed',
        ], EventDelivery::options());
    }
}
