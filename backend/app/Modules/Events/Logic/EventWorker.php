<?php

namespace App\Modules\Events\Logic;

use App\Modules\Events\Data\EventStore;
use App\Modules\Events\Interface\EventHandler;
use Throwable;

final class EventWorker
{
    public function __construct(private EventStore $store) {}

    public function processNext(): bool
    {
        $delivery = $this->store->claimNext();
        if (! $delivery) {
            return false;
        }
        try {
            $this->store->runOwned($delivery, function () use ($delivery): void {
                [$event, $subscription] = $this->store->messageFor($delivery);
                if (! $event || ! $subscription) {
                    throw new \RuntimeException('Event delivery references missing records.');
                }
                $handler = app($subscription->handler);
                if (! $handler instanceof EventHandler) {
                    throw new \RuntimeException('Event handler does not implement EventHandler.');
                }
                $handler->handle($event->topic, json_decode($event->payload, true, 512, JSON_THROW_ON_ERROR), $event->event_key);
            });
        } catch (Throwable $error) {
            $this->store->complete($delivery, false);
            report($error);
        }

        return true;
    }
}
