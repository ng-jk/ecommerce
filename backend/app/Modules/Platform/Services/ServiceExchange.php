<?php

namespace App\Modules\Platform\Services;

use App\Modules\Events\Interface\Events;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ServiceExchange
{
    /** @param array<string, mixed> $message */
    public function enqueue(array $message): void
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Outbox insertion requires the local business transaction.');
        }
        $this->persist('service_deliveries', $message);
    }

    /** Caller authenticates the source credential before this method; no business effects at ingress.
     * @param  array<string, mixed>  $message
     * @return array{id: string, digest: string, status: string}
     */
    public function accept(array $message, string $authenticatedSource, string $destination): array
    {
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Inbox acknowledgment must follow its outermost commit.');
        }
        if (($message['source'] ?? null) !== $authenticatedSource || ($message['destination'] ?? null) !== $destination) {
            throw new \DomainException('Service identity mismatch.');
        }
        $digest = DB::transaction(fn (): string => $this->persist('service_inboxes', $message), 3);

        return ['id' => $message['id'], 'digest' => $digest, 'status' => 'accepted'];
    }

    /** One attempt per call; retry scheduling remains durable, bounded and independent of HTTP. */
    public function relay(ServiceTransport $transport, string $destination): bool
    {
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Relay must start outside a transaction.');
        }
        $row = $this->claim('service_deliveries', $destination);
        if (! $row) {
            return false;
        }
        try {
            $transport->deliver(json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR), $row->digest);
            $status = 'succeeded';
        } catch (\DomainException) {
            $status = 'failed';
        } catch (\Throwable) {
            $status = $row->attempts >= 5 ? 'failed' : 'queued';
        }
        DB::table('service_deliveries')->where('id', $row->id)->where('lease', $row->lease)
            ->where('status', 'processing')->whereNull('deleted_at')->where('lease_until', '>', now())->update([
                'status' => $status, 'lease' => null, 'lease_until' => null,
                'available_at' => now()->addSeconds(2 ** $row->attempts), 'updated_at' => now(),
            ]);

        return true;
    }

    /** @param array<string, mixed> $message */
    private function claim(string $table, string $destination, ?string $source = null, ?string $topic = null): ?object
    {
        return DB::transaction(function () use ($table, $destination, $source, $topic): ?object {
            DB::table($table)->whereNull('deleted_at')->where('status', 'processing')
                ->where('attempts', '>=', 5)->where('lease_until', '<=', now())
                ->update(['status' => 'failed', 'lease' => null, 'lease_until' => null, 'updated_at' => now()]);
            $row = DB::table($table)->whereNull('deleted_at')->where('destination', $destination)
                ->when($source !== null, fn ($query) => $query->where('source', $source))
                ->when($table === 'service_inboxes', function ($query) use ($topic): void {
                    $field = DB::getDriverName() === 'pgsql'
                        ? "(envelope::jsonb->>'topic')" : "json_extract(envelope, '$.topic')";
                    $query->whereRaw($field.($topic === null ? ' <> ?' : ' = ?'),
                        [$topic ?? 'transport.health']);
                })
                ->where('attempts', '<', 5)->where(function ($query): void {
                    $query->where(fn ($q) => $q->where('status', 'queued')->where('available_at', '<=', now()))
                        ->orWhere(fn ($q) => $q->where('status', 'processing')->where('lease_until', '<=', now()));
                })->orderBy('id')->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $row) {
                return null;
            }
            $row->lease = (string) Str::uuid();
            $row->attempts++;
            DB::table($table)->where('id', $row->id)->update([
                'lease' => $row->lease, 'lease_until' => now()->addSeconds(30), 'status' => 'processing',
                'attempts' => $row->attempts, 'updated_at' => now(),
            ]);

            return $row;
        }, 3);
    }

    /** Trusted handlers own schema/action guards. Remote authorization is a fresh snapshot,
     * not an atomic distributed revocation lock. Effects use only this local transaction.
     */
    public function consume(string $destination, callable $authorize, callable $effect, ?string $source = null, ?string $topic = null): bool
    {
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Inbox worker must start outside a transaction.');
        }
        $row = $this->claim('service_inboxes', $destination, $source, $topic);
        if (! $row) {
            return false;
        }
        try {
            $message = json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR);
            $allowed = $authorize($message) === true;
            DB::transaction(function () use ($row, $message, $allowed, $effect): void {
                $owned = DB::table('service_inboxes')->where('id', $row->id)->where('lease', $row->lease)
                    ->where('status', 'processing')->whereNull('deleted_at')->where('lease_until', '>', now())
                    ->lockForUpdate()->first();
                if (! $owned) {
                    return;
                }
                if ($allowed) {
                    $effect($message);
                }
                DB::table('service_inboxes')->where('id', $row->id)->update([
                    'status' => $allowed ? 'succeeded' : 'failed', 'lease' => null,
                    'lease_until' => null, 'updated_at' => now(),
                ]);
            });
        } catch (\Throwable) {
            DB::table('service_inboxes')->where('id', $row->id)->where('lease', $row->lease)
                ->where('status', 'processing')->whereNull('deleted_at')->where('lease_until', '>', now())->update([
                    'status' => $row->attempts >= 5 ? 'failed' : 'queued', 'lease' => null, 'lease_until' => null,
                    'available_at' => now()->addSeconds(2 ** $row->attempts), 'updated_at' => now(),
                ]);
        }

        return true;
    }

    /** @param array<string, mixed> $message */
    private function persist(string $table, array $message): string
    {
        $keys = array_keys($message);
        sort($keys);
        if ($keys !== ['destination', 'id', 'payload', 'source', 'topic', 'version']
            || ! is_string($message['id']) || ! Str::isUuid($message['id']) || $message['version'] !== 1
            || ! is_array($message['payload'])) {
            throw new \InvalidArgumentException('Invalid service envelope.');
        }
        foreach (['source', 'destination', 'topic'] as $field) {
            if (! is_string($message[$field]) || ! preg_match('/^[a-z][a-z0-9_.-]{0,99}$/D', $message[$field])) {
                throw new \InvalidArgumentException('Invalid service envelope identifier.');
            }
        }
        $encoded = json_encode($message, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES, 32);
        if (strlen($encoded) > 65536) {
            throw new \InvalidArgumentException('Service envelope too large.');
        }
        $digest = hash('sha256', $encoded);
        DB::table($table)->insertOrIgnore([
            'message_id' => $message['id'], 'source' => $message['source'], 'destination' => $message['destination'],
            'digest' => $digest, 'envelope' => $encoded, 'status' => 'queued', 'attempts' => 0,
            'available_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $existing = DB::table($table)->where('source', $message['source'])->where('message_id', $message['id'])->lockForUpdate()->first();
        if (! $existing || $existing->deleted_at !== null || ! hash_equals($existing->digest, $digest)) {
            throw new \DomainException('Service message identity already reserved.');
        }

        app(Events::class)->wake();

        return $digest;
    }
}
