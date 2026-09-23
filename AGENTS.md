# Repository implementation and review requirements

Read `docs/engineering-spec.md` and `docs/implementation-plan.md` before implementing
or reviewing changes. They record the user's required target architecture.
Also follow `docs/crud-rules.md`: C01–C10 are mandatory for every backend/frontend
CRUD module. Do not treat baseline gaps as approved exceptions.

- Keep authored logic code at or below 1,000 physical lines, including tests,
  scripts and logical proofs. Generated files, lockfiles, documentation and
  declarative configuration are outside this limit. Never minify logic to bypass it.
- Enforce strict TypeScript and domain/data/presentation dependency separation.
- Register screens as main/temp; Back must never reveal a temp screen. Limit each
  screen to seven primary interactive components using the documented inventory.
- Validate external data at runtime, handle all HTTP outcomes, and make retries
  bounded and idempotent. Partition cache/storage by shop and principal.
- Keep backend authority in PostgreSQL state transitions processed by workers;
  require durable acceptance, execution-time authorization, and safe recovery.
- Map business rules to logic tests and relevant Lean proof obligations. Do not
  claim that model proofs prove the complete PHP/TypeScript implementation.
- Use Python to orchestrate the planned review/test/proof/build/deploy pipeline.
- Follow nested instructions too. Report baseline gaps honestly; these documents
  are requirements and a migration plan, not evidence that migration is complete.
