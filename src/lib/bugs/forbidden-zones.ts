// Zones interdites au worker auto-fix. Tout patch qui touche un de ces
// chemins doit être abandonné et escaladé.
//
// Règle : critique sécu/compliance/billing/migrations/auth/crypto.

export const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /^prisma\/schema\.prisma$/,
  /^prisma\/migrations\//,
  /^src\/lib\/auth\//,
  /^src\/lib\/auth-utils\.ts$/,
  /^src\/lib\/auth\.ts$/,
  /^src\/lib\/auth\.config\.ts$/,
  /^src\/lib\/crypto\//,
  /^src\/app\/api\/v1\/approvals\//,
  /^src\/app\/api\/auth\//,
  /^src\/app\/api\/v1\/ai\/data-delete\//,
  /^src\/app\/api\/v1\/billing\//,
  /^src\/lib\/billing\//,
  /^proxy\.ts$/,
  /^src\/middleware\.ts$/,
  /^\.env/,
  /^package\.json$/,           // modifs deps = approval explicite
  /^package-lock\.json$/,
];

export function isForbiddenPath(relPath: string): boolean {
  // Normalise les chemins Windows et slashes superflus.
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return FORBIDDEN_PATH_PATTERNS.some((r) => r.test(p));
}

export function filterForbidden(changedFiles: string[]): string[] {
  return changedFiles.filter(isForbiddenPath);
}
