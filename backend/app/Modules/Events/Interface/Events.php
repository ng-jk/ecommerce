<?php

namespace App\Modules\Events\Interface;

use App\Modules\Events\Logic\EventPublisher;

final class Events
{
    public function __construct(private EventPublisher $publisher) {}

    /** @param array<string, mixed> $payload */
    public function publish(string $topic, string $aggregateType, int $aggregateId, array $payload, string $eventKey): void
    {
        $this->publisher->publish($topic, $aggregateType, $aggregateId, $payload, $eventKey);
    }

    public function wake(): void
    {
        $this->publisher->wake();
    }

    public function subscribe(string $name, string $topic, string $handler): void
    {
        $this->publisher->subscribe($name, $topic, $handler);
    }
}
