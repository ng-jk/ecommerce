# AI SDK and multi-provider payment implementation

This is an implementation record for the initial expansion slice, not a claim
that the full [Shopify-style plan](shopify-expansion-plan.md) is complete.

## AI integration

`laravel/ai` v1.0.0 is installed and pinned by composer.lock. `ProposalAgent`
advertises the authorized tool schemas, with one inference step and no executable
SDK tool handlers. `FunctionGemma` uses the SDK provider configured in `config/ai.php`.
The private Python container exposes `/v1/chat/completions` and retains `/infer`.
Existing encrypted drafts, receipt ownership, explicit confirmation, current
permissions, argument grounding and worker state checks remain authoritative.

Each Expo app has `/assistant`, reached through its menu/dashboard. The assistant
supports action discovery, natural-language proposals, typed missing inputs,
review, confirmation, pending results and account/cart reconciliation. Credentials
must be supplied in structured secure fields, never ordinary model messages.
Web chat receipts and pending identities stay in memory; reloading the page does
not yet restore an active conversation. Native recovery uses secure storage.
Full browser reload recovery remains an expansion acceptance item.

Actual FunctionGemma tool selection was 10/17 on the existing fixed benchmark
after SDK integration. Structured dispatch and language accuracy are separate.
Broader natural-language reliability and expanded tool retrieval remain open.

## Stripe

The configured default is `stripe`. Existing explicit environment overrides are
preserved. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RETURN_URL`
(HTTPS orders page) and `STRIPE_SANDBOX=true` for a merchant sandbox account.
The backend and worker must use the same credentials/configuration. The signed
webhook is `POST /api/v1/payments/stripe`; Stripe CLI forwarding can test it locally.
No public deployment is needed for isolated provider-fake tests.

Checkout reserves stock and records payment work before making provider requests.
The worker creates hosted Checkout using server totals and a stable idempotency key.
Signed notifications enter a durable encrypted inbox; workers fetch and validate
the session's reference, amount, currency and environment before settlement.
Browser redirects never authorize fulfillment. Verified expiry releases stock once.
Ambiguous creation requires review instead of an uncontrolled second charge attempt.

Hosted Checkout can offer eligible merchant-enabled Stripe payment methods.
The site also supports choosing among explicitly enabled Stripe, Billplz and
custom methods, supplied by the cart API's label map. Unconfigured methods are
omitted and checkout cannot silently fall back to simulated payment.

## Custom full-payment attestation

Configure named custom integrations in `backend/config/payments.php`. This initial
slice uses server configuration; admin payment-method CRUD is not yet implemented.
Example values (load the hash through your own secret configuration):

```php
'enabled' => ['fashion' => ['stripe', 'bank-transfer']],
'custom' => [
    'bank-transfer' => [
        'enabled' => true,
        'shop' => 'fashion',
        'label' => 'Bank transfer',
        'token_hash' => '<SHA-256 of a cryptographically random server token>',
    ],
],
```

Rebuild/restart backend and worker together after changing configuration. If an
environment variable supplies the hash, forward that variable to both containers.
Keep the raw token on the trusted integration server, never in the Expo apps.

Submit from that server:

```http
POST /api/v1/payment-integrations/bank-transfer/confirm
Authorization: Bearer <integration-server-token>
Idempotency-Key: <UUID reused on retries>
Content-Type: application/json

{"invoice_id":"<order.payment.invoice_id>"}
```

The response is a durable 202 with `event_id`; poll
`GET /api/v1/payment-integrations/bank-transfer/{event_id}` with the same server
credential until `processed` or `rejected`. Processing rechecks credential hash,
enabled status, integration, shop and payment identity. Replays do not settle twice.
Customers and AI tools cannot invoke these machine-only settlement endpoints.

Here `invoice_id` aliases the immutable payment reference for one complete order.
It is not yet a separate invoice ledger. The integration attests the full stored
order amount; this does not independently verify receipt of bank funds. Partial
payments, overpayments, refund/dispute ledgers and a merchant recovery console are
still required by the expansion plan and are not implemented in this slice.

## Verification boundaries

PHP tests use real databases and provider HTTP fakes. Raw HTTP tests run through
PostgreSQL, Laravel and workers; only external payment providers are faked in
the isolated test stack. Production images do not include those fixtures.
Real Stripe/Billplz sandbox verification still requires merchant credentials.
Lean checks deterministic logical models, not the SDK, inference weights or
the complete PHP/TypeScript implementation. Deployment and release stay held.

Current measured results are recorded in [testing acceptance](testing-acceptance.md#current-expansion-verification--2026-09-27).
The rebuilt local assistant is available at `/assistant` in fashion, electronics
and admin. Catalog/order results use readable labels and money formatting;
payment links are restricted to the same trusted provider URL patterns as orders.
