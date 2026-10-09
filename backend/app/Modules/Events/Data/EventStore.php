<?php

namespace App\Modules\Events\Data;

use App\Models\EventDelivery;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class EventStore
{
    /** @param array<string, mixed> $payload */
    public function insert(string $topic, string $aggregateType, int $aggregateId, array $payload, string $eventKey): void
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Domain events must be published in the business transaction.');
        }
        DB::table('domain_events')->insertOrIgnore([
            'event_key' => $eventKey,
            'topic' => $topic,
            'aggregate_type' => $aggregateType,
            'aggregate_id' => $aggregateId,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $existing = DB::table('domain_events')->where('event_key', $eventKey)->first();
        if (! $existing || $existing->deleted_at !== null || $existing->topic !== $topic
            || $existing->aggregate_type !== $aggregateType || (int) $existing->aggregate_id !== $aggregateId
            || json_decode($existing->payload, true, 512, JSON_THROW_ON_ERROR) !== $payload) {
            throw new \LogicException('Event key cannot be reused with different content.');
        }
        $this->wake();
    }

    public function wake(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::select("SELECT pg_notify('commerce_events', 'work')");
        }
    }

    public function subscribe(string $name, string $topic, string $handler): void
    {
        DB::transaction(function () use ($name, $topic, $handler): void {
            DB::table('event_subscriptions')->insertOrIgnore([
                'name' => $name, 'topic' => $topic, 'handler' => $handler,
                'active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('event_subscriptions')->where('name', $name)->lockForUpdate()->first();
            DB::table('event_subscriptions')->where('name', $name)->update([
                'topic' => $topic, 'handler' => $handler, 'active' => true,
                'deleted_at' => null, 'updated_at' => now(),
            ]);
        }, 3);
        $this->wake();
    }

    /** Commit database effects and acknowledgment together while fencing reclaim. */
    public function runOwned(object $delivery, callable $effect): void
    {
        DB::transaction(function () use ($delivery, $effect): void {
            $owned = DB::table('event_deliveries')->where('id', $delivery->id)
                ->where('lease', $delivery->lease)->where('status', EventDelivery::Processing)
                ->whereNull('deleted_at')->where('lease_until', '>', now())->lockForUpdate()->first();
            if (! $owned) {
                return;
            }
            $effect();
            // The row lock prevents a replacement owner until effects commit.
            DB::table('event_deliveries')->where('id', $delivery->id)->update([
                'status' => EventDelivery::Succeeded, 'completed_at' => now(), 'lease' => null,
                'lease_until' => null, 'updated_at' => now(),
            ]);
        });
    }

    public function publishNext(): bool
    {
        return DB::transaction(function (): bool {
            $event = DB::table('domain_events')->whereNull('deleted_at')->whereNull('published_at')->orderBy('id')
                ->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $event) {
                return false;
            }
            $subscriptions = DB::table('event_subscriptions')->whereNull('deleted_at')->where('topic', $event->topic)->where('active', true)->cursor();
            foreach ($subscriptions as $subscription) {
                DB::table('event_deliveries')->insertOrIgnore([
                    'event_id' => $event->id,
                    'subscription_id' => $subscription->id,
                    'status' => EventDelivery::Queued,
                    'available_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('domain_events')->where('id', $event->id)->update(['published_at' => now(), 'updated_at' => now()]);

            return true;
        }, 3);
    }

    public function claimNext(): ?object
    {
        return DB::transaction(function (): ?object {
            DB::table('event_deliveries')->whereNull('deleted_at')->where('status', EventDelivery::Processing)->where('attempts', '>=', 5)
                ->where('lease_until', '<=', now())->update([
                    'status' => EventDelivery::Failed, 'lease' => null, 'lease_until' => null, 'updated_at' => now(),
                ]);
            $delivery = DB::table('event_deliveries')->whereNull('deleted_at')->where(function ($query): void {
                $query->where('status', EventDelivery::Queued)->where('available_at', '<=', now())
                    ->orWhere(fn ($expired) => $expired->where('status', EventDelivery::Processing)->where('lease_until', '<=', now()));
            })->where('attempts', '<', 5)->orderBy('id')
                ->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $delivery) {
                return null;
            }
            $lease = (string) Str::uuid();
            DB::table('event_deliveries')->where('id', $delivery->id)->update([
                'status' => EventDelivery::Processing, 'attempts' => $delivery->attempts + 1,
                'lease' => $lease, 'lease_until' => now()->addSeconds(60), 'updated_at' => now(),
            ]);
            $delivery->attempts++;
            $delivery->lease = $lease;

            return $delivery;
        }, 3);
    }

    public function complete(object $delivery, bool $success): void
    {
        $values = $success
            ? ['status' => EventDelivery::Succeeded, 'completed_at' => now()]
            : ['status' => $delivery->attempts >= 5 ? EventDelivery::Failed : EventDelivery::Queued, 'available_at' => now()->addSeconds(2 ** $delivery->attempts)];
        DB::table('event_deliveries')->where('id', $delivery->id)->where('lease', $delivery->lease)
            ->whereNull('deleted_at')->where('lease_until', '>', now())
            ->where('status', EventDelivery::Processing)->update([...$values, 'lease' => null, 'lease_until' => null, 'updated_at' => now()]);
    }

    /** @return array{0: object|null, 1: object|null} */
    public function messageFor(object $delivery): array
    {
        return [
            DB::table('domain_events')->whereNull('deleted_at')->find($delivery->event_id),
            DB::table('event_subscriptions')->whereNull('deleted_at')->where('active', true)->find($delivery->subscription_id),
        ];
    }
}
