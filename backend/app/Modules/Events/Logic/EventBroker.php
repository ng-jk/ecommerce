<?php

namespace App\Modules\Events\Logic;

use App\Modules\Events\Data\EventStore;

final class EventBroker
{
    public function __construct(private EventStore $store) {}

    public function processNext(): bool
    {
        return $this->store->publishNext();
    }
}
