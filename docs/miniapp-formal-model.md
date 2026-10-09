# MiniApp dispatch proof scope

`formal/Commerce/MiniApps.lean` models a deterministic, serialized dispatch
decision. Its state is indexed by shop and MiniApp. Each installation has current
installation/enabled/approval flags, an immutable package identity, configuration
and approval generations, current principal/capability grants, and an abstract dispatch-effect
counter. It is separate from the bundled-plugin balance/credit model in
`formal/Commerce/Plugins.lean`.

The model does not prove the PHP, TypeScript, browser, native WebView, ZIP parser,
hash implementation, SQL locking or deployment. There is no verified refinement
from those implementations to Lean. Tests and review must establish the mapping;
passing proofs cannot substitute for their evidence.

## Implementation mapping and obligations

| Model input | Required implementation interpretation |
| --- | --- |
| `shop`, `app` | Authenticated tenant and selected tenant installation; never an SDK-supplied authority override |
| `authenticated` | Trusted transport authentication and active account validation |
| `targetShop` | Tenant of the requested resource; raw API requests cannot override it |
| `installed`, `enabled` | Current nondeleted installation, checked again under worker locks |
| `approved` | Current approval of the exact immutable release |
| `packageHash` | Abstract identity bound to approved bytes; `mini_app_version_id` may represent it only while its digest and contents are immutable |
| `generation` | `installation_version` launch snapshot compared with the current `config_version`; configuration/grant changes invalidate older launches |
| `approvalGeneration` | `approval_generation` launch snapshot compared with the release's monotonic generation; revocation permanently invalidates previous launches even after reapproval |
| `grants principal capability` | Current account, tenant membership, role, package capability, installation grant, and bundled-handler policy intersection |
| `effects` | Abstract successful dispatch count, not a claim about a particular handler's business mutation |

Authentication, hash collision resistance, correct validation of archive bytes,
atomic snapshots and serialization of conflicting installation changes are explicit
assumptions. Revocation means a revocation that commits before execution. The
model makes no liveness, exactly-once, timing-channel or network-confinement claim.
Operation idempotency and domain effects remain separately tested and modeled.

## Required theorems

- `mini_denied_unchanged`: a denied dispatch has no modeled effect.
- `mini_unauthenticated_denied`, `mini_foreign_target_denied`,
  `mini_uninstalled_denied`, `mini_disabled_denied`, `mini_unapproved_denied`,
  `mini_package_mismatch_denied`, `mini_stale_generation_denied`,
  `mini_stale_approval_denied`, and
  `mini_revoked_denied`: each guard independently denies the request.
- `mini_accepted_then_revoked_unchanged`: prior acceptance does not authorize a
  later execution after the live principal/capability grant is revoked.
- `mini_authorization_noninterference`: states identical at the addressed
  installation make the same authorization decision, regardless of foreign state.
- `mini_other_installation_unchanged` and
  `mini_other_dispatch_preserves_authorization`: dispatch to another installation
  cannot modify this installation or alter its authorization decision.
- `mini_sequences_preserve_other_installation`: the same preservation property
  holds for arbitrary finite lists of foreign-installation dispatches, by induction.
- `mini_accepted_adds_effect`: allowed dispatches have an actual abstract effect;
  the transition is not a model that simply rejects or ignores every request.

The required theorem signatures are pinned in `formal/theorems.json`, and the
Python proof gate compiles the imported module and audits each theorem's transitive
foundational dependencies. Regression tests reject missing MiniApp theorems and a
revocation theorem replaced with a trivial statement.

## Runtime security boundary

The custom MiniApp can supply frontend HTML, JavaScript, CSS and approved assets.
Backend execution is limited to existing reviewed, bundled capability handlers.
The SDK is a convenience interface. Server ingress and workers must enforce the
same authorization when callers bypass it and send requests directly.

Approved bytes require immutable version/digest binding. Static serving uses an
uncredentialed origin, response CSP, MIME validation and an opaque sandboxed frame.
An opaque origin is not a frame identity: bootstrap must bind the specific frame,
a fresh launch nonce and a dedicated channel. No session or bearer credentials
belong in the package, frame URL, JavaScript bootstrap or bridge response.

CSP `connect-src 'none'` restricts fetch/WebSocket-style networking, but does not
prevent the frame navigating itself to an external URL containing previously
granted data. Sandbox restrictions on top navigation do not prevent this own-frame
navigation. Native navigation callbacks likewise do not mediate every resource or
JavaScript network request. Consequently these protections do not prove zero
network egress or prevent a MiniApp disclosing information legitimately granted to
it. The enforceable platform boundary is isolation of credentials, parent/native
privileges and database authority, together with server authorization of every
exposed capability. A stronger egress policy needs additional enforced request
mediation or a constrained renderer and separate verification.
