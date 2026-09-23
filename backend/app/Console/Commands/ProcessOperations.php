<?php

namespace App\Console\Commands;

use App\Domain\OperationProcessor;
use Illuminate\Console\Command;

class ProcessOperations extends Command
{
    protected $signature = 'commerce:work {--once}';

    protected $description = 'Process durable commerce operations with transactional ownership';

    public function handle(OperationProcessor $processor): int
    {
        do {
            $worked = $processor->processNext();
            if (! $worked && ! $this->option('once')) {
                usleep(200000);
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }
}
