<?php

namespace App\Console\Commands;

use App\Domain\OperationProcessor;
use App\Domain\Payments\PaymentProcessor;
use Illuminate\Console\Command;

class ProcessOperations extends Command
{
    protected $signature = 'commerce:work {--once}';

    protected $description = 'Process durable commerce operations with transactional ownership';

    public function handle(OperationProcessor $processor, PaymentProcessor $payments): int
    {
        do {
            $worked = $processor->processNext();
            $worked = $payments->processNext() || $worked;
            if (! $worked && ! $this->option('once')) {
                usleep(200000);
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }
}
