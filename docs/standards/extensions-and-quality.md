# Extension and quality standards

## Plugin model

Plugin business logic is reviewed, versioned code. Deployment profiles and typed configuration select supported behavior; they do not encode an expanding list of company-specific branches. Persistent plugin data is accessed through a platform-managed plugin API or through the owning plugin service's own API. Each trusted plugin service owns its separate database, credentials and migrations. Merchant-authored scripts receive only the bounded SDK/API contract: no core credentials, plugin database credentials, host filesystem or Docker socket. The trusted service mediates persistence under the authenticated installation identity.

Contracts carry semantic versions, compatibility ranges and migration rules. Core upgrades maintain compatible plugin integrations in the shared codebase. A company fork is not the normal customization path. A separate deployment is appropriate when a product requires its own domain or signing profile; it still follows the shared service contract.

The existing [merchant plugin contract](../merchant-plugins.md) describes bundled code with merchant-scoped installations. The [Mini App contract](../miniapps.md) describes approved web packages and their restricted SDK. Neither document claims a general untrusted backend plugin runtime is already implemented. The isolated backend plugin service model in the [architecture target](../architecture/target.md) remains a platform requirement until implementation evidence is indexed.

## Review gates and tests

An approved proposal must pass five distinct reviews before release: requirement, architecture, code, security and compatibility. Reviews cite requirement IDs and record their evidence and unresolved findings. Approval of one review does not imply approval of another.

The two mandatory test categories are unit tests and API functional tests. Unit tests cover owned domain/data behavior, failures, transitions and boundaries. API functional tests send raw requests to the isolated PostgreSQL and worker stack, await terminal outcomes, and verify authorization, contracts and observable invariants. A 202 receipt alone is not successful business behavior. Test reports must be linked to the precise requirement and tested scope.

Owned executable logic targets 100% coverage under each language's required metrics: TypeScript uses statement, branch, function and line coverage; PHP uses executable-line coverage; Python uses statement and branch coverage. Lean models are bounded logical models and do not prove the full implementation. Optional browser, native-device and mutation tests provide additional diagnostics and are not mandatory release test categories unless a specific feature acceptance requires them.

Coverage, successful test runs and Lean proofs are separate evidence. They do not establish all inputs, schedules, runtime environments or integrations. Missing reports and unverified scopes remain pending in the [registry](../registry.json). Canonical test requirements and historical result caveats are in [testing acceptance](../testing-acceptance.md).
