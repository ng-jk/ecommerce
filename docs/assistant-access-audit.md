# Assistant access audit — 2026-09-26

All 17 existing commerce functions are accessible through the assistant API and
have passed real HTTP execution tests for both fashion and electronics shops.
This is verified with explicit action/data requests and required confirmations.
Free-form FunctionGemma tool selection is a separate result: 11/17 prompts matched.
Therefore this report does not claim complete free-form language reliability.

The AI interface audited here is `POST /api/v1/shops/{shop}/assistant`. There is
currently no chat screen in the frontends. Local storefronts and CMS are running
at fashion.localhost:8080, electronics.localhost:8080 and admin.localhost:8080.

| Function | Tool | Effective default roles | Assistant HTTP execution | Free-form test chose expected tool |
|---|---|---|---|---|
| Browse, search, filter and paginate products | `catalog` | Guest, customer, admin | Passed, both shops | Yes |
| View product details | `product` | Guest, customer, admin | Passed, both shops | Yes |
| Sign in | `login` | Guest, customer, admin | Passed, both shops | Yes |
| Register a customer account | `register` | Guest, customer, admin | Passed, both shops | Yes |
| View current account | `me` | Customer, admin | Passed, both shops | Yes |
| Sign out | `logout` | Customer, admin | Passed, both shops | Yes |
| View cart | `cart` | Customer, admin | Passed, both shops | Yes |
| Add/remove items, change quantities, replace or clear cart | `updateCart` | Customer, admin | Passed, both shops | No; select the tool explicitly |
| Checkout with server-calculated prices (simulated payment) | `checkout` | Customer, admin | Passed, both shops | No; select the tool explicitly |
| View/filter/paginate own orders | `orders` | Customer, admin | Passed, both shops | Yes |
| List/filter/paginate CMS inventory | `adminProducts` | Admin | Passed, both shops | No; select the tool explicitly |
| Create product and specifications | `createProduct` | Admin | Passed, both shops | Yes |
| Edit product, price, stock and visibility | `updateProduct` | Admin | Passed, both shops | No; select the tool explicitly |
| View CMS product and form options | `adminProduct` | Admin | Passed, both shops | Yes |
| Soft-delete product | `deleteProduct` | Admin | Passed, both shops | Yes |
| List/filter/paginate shop orders | `adminOrders` | Admin | Passed, both shops | No; select the tool explicitly |
| Advance order: processing, shipped, completed | `updateOrder` | Admin | Passed, both shops | No; select the tool explicitly |

Shop switching is represented by the shop path parameter; both shops were tested.
Categories, publication options, order labels and transitions are returned by the
corresponding list/detail calls. Menu navigation, paging controls and form steps
are presentation concerns backed by the listed tools. There is no implemented
refund, CMS page editor or upload endpoint to claim as an available business tool.
The assistant and operation-polling infrastructure routes are registered but not
recursively callable by the model. The route registry therefore has 19 entries.

## Permission configuration

`backend/config/commerce.php` enumerates actions, enabled flags and role allowlists.
An ordinary authenticated user is a customer. Guest means unauthenticated.
Existing admin, tenant, ownership, account and version guards remain mandatory.
Config cannot grant admin operations to customers or create executable actions.
Missing/disabled rules deny access; confirmation and queued workers recheck rules.
Discovery returns only caller-permitted tools plus effective role/input metadata.

Use `compose.permissions.yaml` to mount the file read-only into API and worker.
After editing, clear Laravel config caches and restart both services. See README.

## Changes made during this audit

- Added shared configurable permissions to REST ingress, workers and AI discovery.
- Added role/permission metadata to discovery and confirmation descriptions.
- Fixed model-call parsing with spaces after commas.
- Added cart quantity/id bounds to the API schema so invalid drafts are rejected.
- Fixed logout polling ordering: resolve identity before reading the receipt, so
  atomic token revocation cannot turn an in-flight logout receipt into a false 404.
- Added both-shop assistant action tests and concurrent logout receipt checks.

## Verification evidence

- 12 real HTTP tests passed; 577 sanitized request/response exchanges recorded.
- All 19 documented routes have successful requests; all 17 business tools executed
  through the assistant separately for each shop.
- 52 PHP tests / 392 assertions passed on SQLite and PostgreSQL; 556/556 combined
  executable application lines covered.
- 30 inference unit tests passed with 100% statement and branch coverage.
- 56 Python pipeline tests, strict TypeScript checks, review checks and 14 Lean
  theorem/axiom checks passed. Lean proves the deterministic model, not inference.
- Real-model safety/completion test passed. Routing result: 11/17 fixed prompts.
  Incorrect proposals were not confirmed or executed. Domain tuning and held-out
  language evaluation remain necessary for reliable unrestricted phrasing.

Artifacts: `test-results/api/exchanges.json`, `test-results/api/coverage.json`,
`test-results/assistant/{fashion,electronics}-matrix.json`,
`test-results/assistant/language-evaluation.json`,
`test-results/assistant/live-confirmation.json`,
`test-results/assistant/local-discovery.json`, and
`test-results/php/assistant-audit-coverage.json`.

Remote deployment and release remain on hold.
