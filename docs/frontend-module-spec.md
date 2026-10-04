# Reusable frontend module specification

This specification implements R03 for every current and future frontend capability.

```text
services/<name>/
  data/               # validated API/storage/cache implementations
  logic/              # framework-free use cases
    pure/             # framework-free business decisions
  index.ts            # explicit public API
screens/<name>_screen/
  data/               # screen-specific adapters; may remain empty
  logic/              # hooks and view models
  interface/          # React components, providers, shared forms and shells
  index.ts            # explicit public screen API
```

Consumers outside a module import only its public index, including types. This
applies to relative references, workspace aliases, dynamic imports and re-exports.
Do not re-export everything merely to evade encapsulation. Export only contracts
needed by consumers. Within a module, use direct internal imports to avoid cycles
through its own barrel. Cycles and unresolved dependencies fail review.

Services cannot depend on screens. Data cannot depend on interface, screens or
React. Logic cannot import interface. Interface cannot import data directly;
invoke a hook/use case instead. Service logic is framework-free and cannot import React/Expo or data
implementations. Screen logic may contain lifecycle hooks. Rendering and React
providers belong in interface. Optional `logic/pure/` directories also enforce
framework-free rules for screen decisions. Pure logic tests need neither a UI runtime nor a network.

Expo `src/app` routes remain thin adapters importing public screen APIs. Each
routable screen is registered main/temp and retains the seven-primary-control
limit and Back-navigation requirements. Shared forms/shells use non-routable screen
modules with the same public-index boundary. Create/Edit remain separate full
pages sharing one form module. Empty layer directories may use `.gitkeep`.

Generated OpenAPI declarations are infrastructure, not hand-authored capability
modules. Tests may directly exercise their owned internals for focused white-box
coverage; this exception never permits production cross-module deep imports.

Run `npm run architecture` (also run by Python review), strict type checking,
lint and all unit/API/coverage gates. Dependency-cruiser parses and resolves the
TypeScript graph rather than scanning source imports with regular expressions.
Boundary regression tests construct real fixture files and test resolution,
including aliases, dynamic imports, re-exports and cycles. Architecture enforcement
supports review; it does not prove semantic purity or replace responsibility review.
