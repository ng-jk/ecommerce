import { afterEach, expect, it } from "vitest";
import { cruise } from "dependency-cruiser";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const config = require("../../.dependency-cruiser.cjs");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
async function findings(
  files: Record<string, string>,
  prefix = ".architecture-test-",
) {
  const root = mkdtempSync(prefix);
  directories.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  const result = await cruise(
    [root],
    {
      ...config.options,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
      outputType: "json",
      tsConfig: undefined,
    },
    {},
    {
      tsConfig: {
        compilerOptions: {
          baseUrl: process.cwd(),
          paths: { "@fixture/*": [`${root}/*`] },
        },
      },
    },
  );
  const report = JSON.parse(String(result.output));
  return report.summary.violations.map(
    (item: { rule: { name: string } }) => item.rule.name,
  );
}
it("allows module internals and public entrypoints", async () => {
  expect(
    await findings({
      "services/a/index.ts": 'export { x } from "./logic/x"',
      "services/a/logic/x.ts": "export const x=1",
      "route.ts": 'export { x } from "./services/a"',
    }),
  ).toEqual([]);
});
it.each([
  'import { x } from "../b/logic/x"; export const y=x',
  'export { x } from "../b/logic/x"',
  'export const load=()=>import("../b/logic/x")',
  'export { x } from "@fixture/services/b/logic/x"',
])("rejects cross-module deep references: %s", async (source) => {
  expect(
    await findings({
      "services/a/index.ts": source,
      "services/b/logic/x.ts": "export const x=1",
    }),
  ).toContain("module-public-entrypoint");
});
it("rejects external deep imports and cycles", async () => {
  const result = await findings({
    "route.ts": 'export { x } from "./services/a/logic/x"',
    "services/a/logic/x.ts": 'import "../../../route"; export const x=1',
  });
  expect(result).toContain("external-public-entrypoint");
  expect(result).toContain("no-cycles");
});
it("rejects inverted layers and unresolved imports", async () => {
  const result = await findings({
    "services/a/data/x.ts":
      'import "../../../screens/a_screen/index"; import "missing-module-xyz"',
    "screens/a_screen/index.ts": "export const x=1",
  });
  expect(result).toContain("service-no-screen");
  expect(result).toContain("data-no-interface");
  expect(result).toContain("resolve-owned-imports");
});

it.each([
  [
    "services/a/logic/use.ts",
    "services/a/interface/view.ts",
    "logic-no-interface",
  ],
  [
    "screens/a_screen/interface/view.ts",
    "screens/a_screen/data/load.ts",
    "interface-no-data",
  ],
  [
    "services/a/logic/pure/rule.ts",
    "services/a/data/load.ts",
    "pure-logic-no-framework",
  ],
])("rejects %s depending on %s", async (source, target, rule) => {
  const { relative, dirname } = await import("node:path");
  const reference = relative(dirname(source), target).replaceAll("\\", "/");
  expect(
    await findings({
      [source]: `import "./${reference}"`,
      [target]: "export const value=1",
    }),
  ).toContain(rule);
});
it("rejects frameworks in pure logic and data", async () => {
  const result = await findings({
    "services/a/logic/pure/rule.ts": 'import "react"',
    "services/a/data/load.ts": 'import "react"',
  });
  expect(result).toContain("pure-logic-no-framework");
  expect(result).toContain("data-no-interface");
});

it("rejects framework imports resolved to workspace React declarations", async () => {
  const result = await findings(
    {
      "services/a/data/context.ts":
        'import { createContext } from "react"; export const context=createContext(null)',
      "services/a/logic/state.ts":
        'import type { ReactNode } from "react"; export type View=ReactNode',
    },
    "frontend/admin/.architecture-test-",
  );
  expect(result).toContain("data-no-interface");
  expect(result).toContain("pure-logic-no-framework");
});

it("rejects service imports through the presentation package facade", async () => {
  const result = await findings({
    "services/a/data/client.ts":
      'import { useStore } from "@portfolio/storefront"; export const hook=useStore',
  });
  expect(result).toContain("service-no-screen");
});
it("rejects a logic to own-barrel to interface backdoor cycle", async () => {
  const result = await findings({
    "screens/a_screen/index.ts": 'export { view } from "./interface/view"',
    "screens/a_screen/interface/view.ts":
      'import { state } from "../logic/state"; export const view=state',
    "screens/a_screen/logic/state.ts":
      'import { view } from "../index"; export const state=()=>view',
  });
  expect(result).toContain("no-cycles");
});
