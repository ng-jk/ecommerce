<?php

namespace App\Console\Commands;

use App\Modules\Events\Logic\EventWaiter;
use App\Modules\Platform\Services\ServiceWorker;
use Illuminate\Console\Command;

class ProcessServiceExchange extends Command
{
    protected $signature = 'services:work {--once}';

    protected $description = 'Relay and consume authenticated durable service messages';

    public function handle(ServiceWorker $worker, EventWaiter $waiter): int
    {
        do {
            $worked = $worker->processNext();
            if (! $worked && ! $this->option('once')) {
                $waiter->wait();
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }
}
