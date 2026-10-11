import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const digest = (source) => createHash("sha256").update(source).digest("hex");
export function applyDependencySecurityPatches(root, verifyOnly) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "security/dependency-patches.json"), "utf8"),
  );
  const pending = [];
  for (const patch of manifest.patches) {
    const metadata = JSON.parse(
      readFileSync(
        resolve(root, "node_modules", patch.package, "package.json"),
        "utf8",
      ),
    );
    if (metadata.version !== patch.version)
      throw new Error(
        `Review security patch for ${patch.package}@${metadata.version}`,
      );
    for (const file of patch.files) {
      const path = resolve(root, file.path);
      let source = readFileSync(path, "utf8");
      if (digest(source) === file.patchedSha256) continue;
      if (verifyOnly || digest(source) !== file.originalSha256)
        throw new Error(`Unverified dependency bytes: ${file.path}`);
      for (const replacement of file.replacements) {
        if (source.split(replacement.before).length !== 2)
          throw new Error(`Patch anchor mismatch: ${file.path}`);
        source = source.replace(replacement.before, replacement.after);
      }
      if (digest(source) !== file.patchedSha256)
        throw new Error(`Patched hash mismatch: ${file.path}`);
      pending.push({ path, source });
    }
  }
  for (const { path, source } of pending) writeFileSync(path, source);
  return `Verified ${manifest.patches.length} dependency security patches; applied ${pending.length} files.`;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    applyDependencySecurityPatches(
      fileURLToPath(new URL("../", import.meta.url)),
      process.argv.includes("--verify"),
    ),
  );
}
