import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyDependencySecurityPatches } from "./apply-dependency-security-patches.mjs";

const require = createRequire(import.meta.url);
const braces = require("braces");
const forge = require("node-forge");
const decode = require("decode-uri-component");

test("installed dependency patch digests are exact", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/apply-dependency-security-patches.mjs", "--verify"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("braces rejects deep text and supplied ASTs before stack exhaustion", () => {
  const nested = "{".repeat(4000) + "a,b" + "}".repeat(4000);
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(nested), {
      name: "SyntaxError",
      message: /security depth limit/,
    });
    let ast = { type: "text", value: "a" };
    for (let i = 0; i < 5000; i++) ast = { type: "root", nodes: [ast] };
    assert.throws(() => operation(ast), {
      name: "SyntaxError",
      message: /security depth limit/,
    });
  }
  assert.deepEqual(braces.expand("a{b,c}{1..3}"), [
    "ab1",
    "ab2",
    "ab3",
    "ac1",
    "ac2",
    "ac3",
  ]);
  assert.equal(braces.compile("a{b,c}"), "a(b|c)");
  assert.equal(braces.stringify(braces.parse("a{b,c}")), "a{b,c}");
});

test("RSA verifies legitimate digests and rejects extra nested algorithm elements", () => {
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair({
    bits: 1024,
    e: 3,
  });
  const digest = forge.md.sha256
    .create()
    .update("dependency-security-regression")
    .digest()
    .getBytes();
  const { asn1 } = forge;
  const sequence = (children) =>
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
  const oid = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OID,
    false,
    asn1.oidToDer(forge.oids.sha256).getBytes(),
  );
  const nil = () =>
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "");
  const signature = (algorithm) => {
    const info = sequence([
      sequence(algorithm),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
    ]);
    return forge.pki.rsa.encrypt(asn1.toDer(info).getBytes(), privateKey, 1);
  };
  assert.equal(publicKey.verify(digest, signature([oid])), true);
  assert.equal(publicKey.verify(digest, signature([oid, nil()])), true);
  for (const garbage of [
    nil(),
    sequence([nil()]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, "garbage"),
  ]) {
    assert.throws(
      () => publicKey.verify(digest, signature([oid, nil(), garbage])),
      /DigestInfo/,
    );
  }
  assert.equal(
    publicKey.verify("wrong digest", signature([oid, nil()])),
    false,
  );
});

test("URI backport preserves CommonJS query parsing and decodes valid UTF-8", () => {
  for (const [input, expected] of [
    ["a+b", "a b"],
    ["%C3%A5", "å"],
    ["%F0%9F%98%80", "😀"],
    ["%FF%41", "%FFA"],
    ["%C2", "�"],
    ["%FE%FF", "��"],
    ["%", "%"],
  ]) {
    assert.equal(decode(input), expected);
  }
  assert.throws(() => decode(null), TypeError);
  assert.deepEqual(
    { ...require("query-string").parse("name=a+b&emoji=%F0%9F%98%80") },
    { name: "a b", emoji: "😀" },
  );
});

test("malformed URI workload finishes without recursive exponential work", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "const d=require('decode-uri-component'); const s='%FF'.repeat(20000); if(d(s)!==s)process.exit(1)",
    ],
    { timeout: 5000, encoding: "utf8" },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("NYC YAML replacement loads configuration without sprintf-js", () => {
  const fromNyc = createRequire(require.resolve("@istanbuljs/load-nyc-config"));
  assert.match(fromNyc("js-yaml/package.json").version, /^4\./);
  assert.deepEqual(
    fromNyc("js-yaml").load("include:\n  - src/**/*.js\nall: true\n"),
    { include: ["src/**/*.js"], all: true },
  );
  assert.throws(() => fromNyc.resolve("sprintf-js"), {
    code: "MODULE_NOT_FOUND",
  });
});

test("patch applier fails closed on changed versions, bytes, anchors, hashes, or missing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "dependency-patch-test-"));
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  const file = "node_modules/fixture/index.js";
  const metadata = join(directory, "node_modules/fixture/package.json");
  const target = join(directory, file);
  const manifestPath = join(directory, "security/dependency-patches.json");
  try {
    for (const folder of ["scripts", "security", "node_modules/fixture"])
      mkdirSync(join(directory, folder), { recursive: true });
    const manifest = {
      patches: [
        {
          package: "fixture",
          version: "1.0.0",
          files: [
            {
              path: file,
              originalSha256: hash("old"),
              patchedSha256: hash("new"),
              replacements: [{ before: "old", after: "new" }],
            },
          ],
        },
      ],
    };
    const entry = manifest.patches[0].files[0];
    const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
    const run = (...args) => {
      try {
        return {
          status: 0,
          stdout: applyDependencySecurityPatches(
            directory,
            args.includes("--verify"),
          ),
          stderr: "",
        };
      } catch (error) {
        return { status: 1, stderr: String(error) };
      }
    };
    writeFileSync(metadata, JSON.stringify({ version: "1.0.0" }));
    writeFileSync(target, "old");
    save();
    assert.notEqual(run("--verify").status, 0);
    assert.equal(readFileSync(target, "utf8"), "old");
    assert.equal(run().status, 0);
    assert.equal(readFileSync(target, "utf8"), "new");
    assert.equal(run().status, 0);
    assert.equal(run("--verify").status, 0);
    writeFileSync(metadata, JSON.stringify({ version: "2.0.0" }));
    assert.match(run().stderr, /Review security patch/);
    writeFileSync(metadata, JSON.stringify({ version: "1.0.0" }));
    writeFileSync(target, "tampered");
    assert.match(run().stderr, /Unverified dependency bytes/);
    writeFileSync(target, "old");
    entry.replacements[0].before = "missing";
    save();
    assert.match(run().stderr, /Patch anchor mismatch/);
    entry.replacements[0].before = "old";
    entry.replacements[0].after = "wrong";
    save();
    assert.match(run().stderr, /Patched hash mismatch/);
    assert.equal(readFileSync(target, "utf8"), "old");
    entry.replacements[0].after = "new";
    manifest.patches[0].files.push({
      ...entry,
      path: "node_modules/fixture/missing.js",
    });
    save();
    assert.match(run().stderr, /ENOENT/);
    assert.equal(
      readFileSync(target, "utf8"),
      "old",
      "validate all files before applying any patch",
    );
    rmSync(metadata);
    assert.match(run().stderr, /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
