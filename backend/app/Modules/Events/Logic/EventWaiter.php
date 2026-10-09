<?php

namespace App\Modules\Events\Logic;

use App\Modules\Events\Data\EventListener;

final class EventWaiter
{
    public function __construct(private EventListener $listener) {}

    public function wait(int $milliseconds = 1000): void
    {
        $this->listener->wait($milliseconds);
    }
}
