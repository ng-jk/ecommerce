# Mandatory CRUD rules

These requirements apply to every backend and frontend CRUD module, including
future modules. They supplement [R01–R11](engineering-spec.md). They are recorded
requirements; existing CRUD flows still require migration and compliance review.

## C01 — Pagination

List views must use Laravel `paginate()`, never an unbounded `get()`. Validate page
and page-size parameters, enforce a maximum size, and use stable ordering with a
unique tie-breaker. The frontend consumes pagination metadata and renders loading,
empty, error, and page-boundary states. This rule does not ban bounded internal
row retrieval needed to process a transaction; it specifically governs list views.

## C02 — Indexed filters

Provide useful filters for each list. Every exposed filter must have a matching
database index, including tenant scope and the supported comparison/order pattern.
Never expose an unindexed filter. Maintain a filter-to-index inventory and review
query plans with representative data. A plain B-tree does not make arbitrary
substring or case-folded search indexed.

For PostgreSQL free-text search, use a full-text search vector and a suitable GIN
index, with matching query semantics. Validate/allowlist filter and sort names;
never interpolate arbitrary client column names into queries.

## C03 — Shared standalone Create/Edit pages

Create and Edit each render the same module Form component on a standalone full
page. Never use a create/edit modal, popup, drawer, or inline substitute.

The requested `Pages/<Module>/Create.jsx`, `Edit.jsx`, and `Form.jsx` convention maps
to this strict-TypeScript Expo project as:

```text
presentation/screens/<Module>/Create.tsx
presentation/screens/<Module>/Edit.tsx
presentation/screens/<Module>/Form.tsx
```

Thin `src/app/` route adapters render these pages. The form accepts typed values,
model-provided options, field errors, and submit state; use cases own business
logic and data adapters own persistence. Declare each page main/temp under R04;
standalone full-page rendering does not exempt a temp page from the Back rule.
The seven-primary-control limit still applies; split complex workflows into
standalone steps sharing form logic rather than hiding controls in a modal.

## C04 — Transactions, locks, and immutable records

Wrap mutating critical sections in a database transaction. Use `lockForUpdate()`
on rows where concurrent writes could corrupt state: stock-in/code allocation,
POS stock-out, inventory, order items, and order-item status changes.

Acquire locks in a consistent order and validate again after locking. Reject
edits to locked business records, such as paid orders, from both UI and direct API
requests. Worker execution must enforce these guards, even if the command was
valid when queued. UI disabling is not a substitute for server enforcement.

Locks cannot protect a row that does not yet exist. Back code allocation and
duplicate prevention with database unique constraints and handle conflicts. Any
deadlock retry must be bounded and must preserve operation idempotency.

## C05 — Database uniqueness

Enforce reasonable unique keys in PostgreSQL, not only in form validation:

- Codes and order numbers.
- Email addresses with an explicit normalization/case policy.
- Category/outlet names within their declared business scope.
- Pivot pairs, `staff.user_id`, and `payment_methods.name`.

For independent shops, scope tenant-local keys by `shop_id`; truly global keys
remain global. Specify each key's scope in migrations and contract documentation.
Decide whether soft-deleted values remain reserved. If reuse is intended, use an
appropriate active-row unique index and test restoration conflicts. Do not remove
tenant isolation to create a global constraint accidentally.

## C06 — Model-owned enum options

Every enum column has named constant values in its owning model and a static
`options()` method returning `[value => label]`. Never hard-code enum choices or
labels in the frontend. For multiple enum columns, use an explicitly named field
argument or field-specific model maps exposed through the options method.

For Expo, include these maps in the authorized API form metadata and pass them as
typed props to Form. If an Inertia adapter is added, pass the same maps as Inertia
props. Domain code compares validated values; presentation displays map labels.
Unknown values must produce a controlled compatibility error, not an invented label.

## C07 — Timestamps and soft deletion

Every table must have `created_at`, `updated_at`, and `deleted_at`, created with
`$table->timestamps()` and `$table->softDeletes()`. Its Eloquent model uses
`SoftDeletes`. Include pivot tables/custom pivot models in the schema inventory.

The wording is universal: do not silently exempt sessions, queue, cache, migration,
token, or framework-managed tables. Some are not Eloquent-backed and framework
drivers may physically delete rows. Record these compatibility gaps and implement
compatible adapters/models or obtain an explicit scoped rule decision before
claiming universal compliance. Simply adding a column does not enforce soft delete.

Specify delete, restore, tenant scope, cascade, unique-key reuse, retention, and
audit behavior. Normal list/detail queries must hide deleted records. Only
authorized restore/audit flows may include them. Soft delete is not privacy erasure.

## C08 — One validation error contract

All backend validation failures use a `validation_error` associative array:
field name to an array of messages. JSON serializes the field map as an object:

```json
{
  "validation_error": {
    "email": ["The email address is already in use."]
  }
}
```

Do not expose Laravel's default `errors` bag for these flows. The base controller's
`validate()` helper owns the HTTP validation boundary and uses the same normalizer
as worker/domain validation, FormRequest failures, and database constraint errors.
Map constraint failures to safe field messages without leaking SQL or internals.

For Inertia flows, the helper flashes this map and middleware shares it as the
`validation_error` prop. This project currently uses Expo plus a JSON API, not
Inertia: return the same map as JSON for ingress failures and within the stored
rejected-operation result for asynchronous failures. The frontend data adapter
normalizes both into the identical field-error type and passes it to Form.

Ingress validation returns HTTP 422. An operation already accepted with HTTP 202
subsequently exposes `status: rejected` and the same validation map in its result;
polling success does not mean the business action succeeded. Correlation/state
metadata required by R06 may surround the map, but its shape never varies.
Authentication, authorization, and infrastructure failures remain their own typed
errors; do not mislabel them as field validation or disclose unauthorized state.

## C09 — Centralized uploads

All uploads go through `App\Support\FileUploader::store()`. Stored filenames are
exactly `{model_id}_{uniqid()}.{ext}`. The extension must be in an explicit
whitelist; derive/validate it against trusted MIME inspection, not only the client
filename. Enforce file size, content policy, ownership, and safe storage paths.
Use exclusive creation or collision retry because `uniqid()` is not a security
token or a guaranteed globally unique identifier.

Within the business transaction: create the row first, obtain its ID, upload via
the helper, then persist the resulting path. Filesystem/object storage is not
rolled back by a database transaction: compensate failed commits by removing the
new file, and reconcile orphan files after crashes. Retain an old file until its
replacement commits. An idempotent retry must not attach duplicate files.

With async ingress, stage bytes privately through a staging method on the same
uploader service and enqueue only a validated reference, size, digest, and owner.
The worker revalidates it and calls `store()` after creating the business row.
Final stored filenames must follow the rule; staging files have a short TTL and
cannot be served as public business uploads. Do not enqueue client-controlled paths.

## C10 — Visible data and metadata

Hide internal/metadata attributes with `$hidden` and explicitly allowlist public
fields through API Resources. Do not serialize models, relations, or pivots
wholesale into display payloads. Never expose passwords, token material, internal
queue payloads, audit internals, or pivot linkage details.

List responses use `{ data, meta }`: public records under `data`, pagination and
authorized list metadata under `meta`. Laravel paginated API Resource collections
can supply this separation; raw paginator serialization must be normalized if
its metadata is top-level. Put documented pagination links under `meta` for this
exact contract. Keep required public workflow versions/status explicit in the
resource contract rather than accidentally hiding what clients need.

## Review and test evidence

Every CRUD module must identify its paginator, filter/index pairs, unique keys,
enum model maps, soft-delete behavior, lock/transaction boundary, locked states,
public Resource fields, upload path, and shared Create/Edit form/page registration.

Tests must cover pagination bounds, indexed filter contracts, concurrent duplicate
creates, immutable-record edits through raw API requests, cross-shop identifiers,
soft-delete/restore conflicts, enum metadata rendering, validation shape at every
boundary, upload rollback/retry/whitelist behavior, and hidden-field leakage.
Verify Create/Edit are standalone routes and share Form, with no Back destination
that violates main/temp classification.
