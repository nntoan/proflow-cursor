import type { Patch } from "../types.js";

export function isVerified(patch: Patch, version: string): boolean {
  return patch.verifiedVersions.includes(version);
}

/** Posture B: warn loudly, attempt anyway. */
export function unverifiedWarning(patch: Patch, version: string): string {
  const verified = patch.verifiedVersions.join(", ") || "none";
  return (
    `WARNING: patch "${patch.id}" is not verified for cursor-agent ${version} ` +
    `(verified: ${verified}) — attempting anyway; failure leaves files untouched`
  );
}
