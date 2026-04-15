/**
 * Helper central pour construire l'URL d'une organisation.
 *
 * Préférence : `clientCode` (p. ex. "HVAC") → `slug` → `id` (cuid).
 * La route cible est toujours `/organisations/[slug]` ; le composant
 * page résout slug/clientCode/name/cuid côté serveur via
 * `/api/v1/organizations/resolve`, donc on peut passer l'un ou l'autre
 * et l'URL reste propre dans la barre d'adresse.
 */
export function orgUrl(
  org: { clientCode?: string | null; slug?: string | null; id?: string | null } | null | undefined,
): string {
  if (!org) return "/organisations";
  const seg = org.clientCode || org.slug || org.id;
  if (!seg) return "/organisations";
  return `/organisations/${encodeURIComponent(seg)}`;
}

/** Vrai si la chaîne ressemble à un cuid (début `c` + 20+ chars hex). */
export function looksLikeCuid(s: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(s);
}
