<?php

namespace App\Modules\Events\Data;

use Illuminate\Support\Facades\DB;
use PDO;
use Throwable;

final class EventListener
{
    private ?PDO $listener = null;

    public function wait(int $milliseconds): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            usleep($milliseconds * 1000);

            return;
        }
        try {
            if ($this->listener === null) {
                DB::statement('LISTEN commerce_events');
                $this->listener = DB::connection()->getPdo();
            }
            $this->listener->pgsqlGetNotify(PDO::FETCH_ASSOC, $milliseconds);
        } catch (Throwable) {
            $this->listener = null;
            DB::disconnect();
            usleep(min($milliseconds, 1000) * 1000);
        }
    }
}
