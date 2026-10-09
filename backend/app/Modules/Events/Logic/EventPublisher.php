<?php

namespace App\Modules\Events\Logic;

use App\Modules\Events\Data\EventStore;
use App\Modules\Events\Interface\EventHandler;

final class EventPublisher
{
    public function __construct(private EventStore $store) {}

    /** @param array<string, mixed> $payload */
    public function publish(string $topic, string $aggregateType, int $aggregateId, array $payload, string $eventKey): void
    {
        $this->store->insert($topic, $aggregateType, $aggregateId, $payload, $eventKey);
    }

    public function wake(): void
    {
        $this->store->wake();
    }

    public function subscribe(string $name, string $topic, string $handler): void
    {
        if (! is_subclass_of($handler, EventHandler::class)) {
            throw new \InvalidArgumentException('Subscriber must implement EventHandler.');
        }
        $this->store->subscribe($name, $topic, $handler);
    }
}
