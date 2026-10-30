import { REGISTRY, VERIFIED_VERSION } from "../patches/registry.js";
import { log } from "../ui/log.js";

export function listPatches(): number {
  for (const entry of REGISTRY) {
    const mark = entry.defaultEnabled ? "on " : "off";
    log.info(`${entry.id} [default: ${mark}]`);
    log.info(`    ${entry.description}`);
  }
  log.info("adhoc-patch [subcommand]");
  log.info("    one-shot string/regex/script edit via `tweakcursor adhoc-patch` (no backup)");
  log.info(`\nanchor-verified against cursor-agent ${VERIFIED_VERSION}`);
  return 0;
}
