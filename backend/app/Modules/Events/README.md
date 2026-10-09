# Durable event contract

`Interface/Events` is the public publishing/subscription boundary. `Data/EventStore` owns PostgreSQL persistence; the broker materializes subscriber deliveries and the worker applies their database effects. Domain events, subscriptions and deliveries are logged durable tables. `LISTEN/NOTIFY` is only a wakeup hint; scans recover missed notifications and lease-expired work.

Publish inside the business transaction using a stable event key. The event and business transition commit or roll back together. Reusing a key with different topic, aggregate or payload fails. Publication fans out once to each active, non-deleted subscription using a unique event/subscription pair. Subscribing later does not replay already-published historical events. Re-subscribing an existing name updates its topic/handler, reactivates and restores it, and preserves its original creation timestamp.

## Handler effects and fencing

Workers claim a delivery with a 60-second lease and a new lease identifier. `runOwned` locks the delivery and verifies its current, unexpired ownership before invoking the handler. Handler database effects and successful acknowledgment then commit in one transaction. A thrown exception rolls both back. The held delivery lock prevents another claimant from taking ownership during that transaction; a handler that started with a valid lease may finish after its nominal deadline while retaining the lock. An expired, superseded, completed or soft-deleted owner cannot begin effects.

Handlers must use the current database connection and transaction. They must not commit independently, switch database connections, or perform direct network, filesystem or other irreversible external effects. Record such work in a transactional outbox and execute it separately with provider idempotency and recovery. The PHP interface documents this contract; it cannot mechanically prevent a handler from violating it. Nontransactional in-memory counters and logging are not rolled back.

Retryable handler failure returns a delivery to queued state with bounded exponential delay. Five attempts exhaust delivery into failed state. An expired final attempt is also marked failed without invoking its handler. No exactly-once network-delivery guarantee is made. Notifications do not carry business authority or replace durable records.

## Subscription revocation and isolation assumptions

The worker rereads an active, non-deleted subscription after locking its delivery and before invoking the handler. Revocation committed before that read prevents execution. Subscription rows are not locked for the duration of handler effects: a concurrent revocation that commits after this read does not cancel an already-running handler. Strict revocation linearization would require a shared subscription lock/version policy and a real concurrency test; it is not asserted here.

Subscriptions are trusted platform registrations, not tenant-facing package grants. The event tables do not themselves enforce tenant-bound recipient authorization. Any tenant-specific handler must validate the event's tenant/aggregate scope and execution-time business permission within its transaction. Do not expose global subscription registration as an untrusted plugin API.

## Models and verification

`DomainEvent`, `EventSubscription` and `EventDelivery` use soft deletion and hide their internal payload/key, handler and lease metadata. Delivery state labels come from `EventDelivery::options()`. Ordinary model queries hide deleted rows; operational queries explicitly apply deletion predicates. Event keys and subscription names remain reserved after soft deletion. No public restore/delete UI or general CRUD parity is implied.

`tests/Feature/EventFlowTest.php` covers publication rollback, duplicate/conflicting keys, missing-notification recovery, revoked subscribers, retry exhaustion, stale acknowledgment, rollback of a handler's business effect plus derived event, stale/expired/completed effect suppression, subscription restoration and model metadata/soft deletion. These are test definitions, not passing evidence. At authoring time PHP and the Docker Linux engine were unavailable, so PHPUnit, Pint and real PostgreSQL concurrency verification were blocked. Run the affected PHPUnit test and Pint in the configured backend environment before approval. Sequential lease tests do not establish all concurrent schedules, cross-connection behavior or database crash recovery.
