<?php

namespace App\Modules\Events\Interface;

interface EventHandler
{
    // Database effects use the current connection/transaction. External effects
    // must be durable outbox records, never network calls inside this handler.
    /** @param array<string, mixed> $payload */
    public function handle(string $topic, array $payload, string $eventKey): void;
}
