<?php

namespace Tests\Feature;

use App\Modules\Events\Data\EventListener;
use App\Modules\Events\Interface\Events;
use Illuminate\Support\Facades\DB;
use LogicException;
use RuntimeException;
use Tests\TestCase;

class EventInfrastructureTest extends TestCase
{
    public function test_publication_outside_a_business_transaction_is_rejected(): void
    {
        $this->assertSame(0, DB::transactionLevel());
        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('Domain events must be published in the business transaction.');
        app(Events::class)->publish('order.placed', 'order', 42, ['order_id' => 42], 'order:42:placed');
    }

    public function test_listener_disconnects_after_failure_and_retries_subscription_on_next_wait(): void
    {
        DB::shouldReceive('getDriverName')->twice()->andReturn('pgsql');
        DB::shouldReceive('statement')->with('LISTEN commerce_events')->twice()
            ->andThrow(new RuntimeException('Database connection unavailable.'));
        DB::shouldReceive('disconnect')->twice();

        $listener = new EventListener;
        $listener->wait(1);
        $listener->wait(1);
    }
}
