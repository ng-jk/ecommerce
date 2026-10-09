<?php

namespace App\Console\Commands;

use App\Domain\OperationProcessor;
use App\Domain\Payments\PaymentProcessor;
use App\Modules\Events\Logic\EventBroker;
use App\Modules\Events\Logic\EventWaiter;
use App\Modules\Events\Logic\EventWorker;
use Illuminate\Console\Command;

class ProcessOperations extends Command
{
    protected $signature = 'commerce:work {--once}';

    protected $description = 'Process durable commerce operations with transactional ownership';

    public function handle(OperationProcessor $processor, PaymentProcessor $payments, EventBroker $broker, EventWorker $events, EventWaiter $waiter): int
    {
        do {
            $worked = $processor->processNext();
            $worked = $payments->processNext() || $worked;
            $worked = $broker->processNext() || $worked;
            $worked = $events->processNext() || $worked;
            if (! $worked && ! $this->option('once')) {
                $waiter->wait();
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }
}
