#!/usr/bin/env node
// Dev-only: copies patch-target JS files from the LOCAL cursor-agent install into
// test/.local-fixtures/ (gitignored). The output contains Anysphere code — NEVER commit it.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = os.homedir();
const versionsRoot = path.join(home, ".local", "share", "cursor-agent", "versions");
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(pkgRoot, "test", ".local-fixtures");

if (!existsSync(versionsRoot)) {
  console.error(`no cursor-agent versions dir at ${versionsRoot}`);
  process.exit(1);
}
const versions = readdirSync(versionsRoot)
  .filter((d) => existsSync(path.join(versionsRoot, d, "index.js")))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
if (versions.length === 0) {
  console.error("no cursor-agent installs found");
  process.exit(1);
}
const version = versions[0];
const src = path.join(versionsRoot, version);
const dest = path.join(outRoot, `install-${version}`);
mkdirSync(dest, { recursive: true });
const files = ["index.js", ...readdirSync(src).filter((f) => /^\d+\.index\.js$/.test(f))];
for (const f of files) copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`local fixtures: copied ${files.length} files from ${version} -> ${dest}`);
