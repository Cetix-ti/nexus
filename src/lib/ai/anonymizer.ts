/**
 * AI Data Anonymizer — Proxy layer between Nexus data and external AI APIs.
 *
 * Replaces PII (names, emails, phones, org names, addresses) with consistent
 * pseudonyms before sending to ChatGPT, then de-anonymizes the response.
 *
 * The mapping table lives in server memory only — never sent to the AI API.
 * Pseudonyms are deterministic per request so the AI can reason about
 * relationships ("ORG_1's ticket" → same org across the prompt).
 */

import prisma from "@/lib/prisma";

// ===========================================================================
// Types
// ===========================================================================
export interface AnonymizationMap {
  forward: Map<string, string>;
  reverse: Map<string, string>;
  counters: { person: number; org: number; email: number; phone: number; domain: number; address: number };
}

// ===========================================================================
// Regex patterns (created per-call to avoid stateful g-flag issues)
// ===========================================================================
const emailPattern = () => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const phonePattern = () => /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

// ===========================================================================
// Create a fresh map
// ===========================================================================
export function createAnonymizer(): AnonymizationMap {
  return {
    forward: new Map(),
    reverse: new Map(),
    counters: { person: 0, org: 0, email: 0, phone: 0, domain: 0, address: 0 },
  };
}

// ===========================================================================
// Register a value (idempotent, O(1))
// ===========================================================================
function register(map: AnonymizationMap, original: string, category: keyof AnonymizationMap["counters"], prefix: string): string {
  const key = original.trim();
  if (!key || key.length < 2 || key === "—" || key === "-") return key;
  // Already registered
  const existing = map.forward.get(key);
  if (existing) return existing;
  // Generate a unique pseudo that doesn't collide with any existing original
  map.counters[category] += 1;
  let pseudo = `${prefix}${map.counters[category]}`;
  while (map.forward.has(pseudo)) {
    map.counters[category] += 1;
    pseudo = `${prefix}${map.counters[category]}`;
  }
  map.forward.set(key, pseudo);
  map.reverse.set(pseudo, key);
  return pseudo;
}

// ===========================================================================
// Pre-seed the map with known entities from the database
// This is the key step — it ensures all PII in the prompt will be caught.
// ===========================================================================
export async function seedFromDatabase(map: AnonymizationMap): Promise<void> {
  const [orgs, contacts, users] = await Promise.all([
    prisma.organization.findMany({ where: { isActive: true }, select: { name: true, domain: true, phone: true }, take: 200 }),
    prisma.contact.findMany({ select: { firstName: true, lastName: true, email: true, phone: true }, take: 500 }),
    prisma.user.findMany({ select: { firstName: true, lastName: true, email: true }, take: 100 }),
  ]);

  for (const o of orgs) {
    register(map, o.name, "org", "ORG_");
    if (o.domain) register(map, o.domain, "domain", "domaine_");
    if (o.phone) register(map, o.phone, "phone", "TEL_");
  }
  for (const c of contacts) {
    const fullName = `${c.firstName} ${c.lastName}`.trim();
    if (fullName.length > 2) register(map, fullName, "person", "CONTACT_");
    if (c.email) register(map, c.email, "email", "email_");
    if (c.phone) register(map, c.phone, "phone", "TEL_");
  }
  for (const u of users) {
    const fullName = `${u.firstName} ${u.lastName}`.trim();
    if (fullName.length > 2) register(map, fullName, "person", "AGENT_");
    if (u.email) register(map, u.email, "email", "email_");
  }
}

// ===========================================================================
// Anonymize free text (one-pass replacement, sorted by length descending)
// ===========================================================================
export function anonymizeText(map: AnonymizationMap, text: string): string {
  if (!text || map.forward.size === 0) return text;

  let result = text;

  // 1. Replace all known entities (longest first to avoid partial matches)
  const entries = Array.from(map.forward.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [original, pseudo] of entries) {
    // Simple string replacement (faster than regex for exact matches)
    let idx = 0;
    while (true) {
      const pos = result.toLowerCase().indexOf(original.toLowerCase(), idx);
      if (pos === -1) break;
      result = result.slice(0, pos) + pseudo + result.slice(pos + original.length);
      idx = pos + pseudo.length;
    }
  }

  // 2. Catch any remaining emails/phones not in the seed
  result = result.replace(emailPattern(), (match) => {
    if (map.forward.has(match)) return map.forward.get(match)!;
    return register(map, match, "email", "email_");
  });
  result = result.replace(phonePattern(), (match) => {
    if (map.forward.has(match)) return map.forward.get(match)!;
    return register(map, match, "phone", "TEL_");
  });

  return result;
}

// ===========================================================================
// De-anonymize AI response (restore real values)
// ===========================================================================
export function deanonymize(map: AnonymizationMap, text: string): string {
  if (!text || map.reverse.size === 0) return text;

  let result = text;

  // Replace pseudonyms with originals (longest first)
  const entries = Array.from(map.reverse.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [pseudo, original] of entries) {
    // Split-join is safe against infinite loops (unlike while+includes)
    result = result.split(pseudo).join(original);
  }

  return result;
}

// ===========================================================================
// Anonymize structured data (for RAG results before text formatting)
// ===========================================================================
export function anonymizeRecord(map: AnonymizationMap, data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  const personFields = ["requesterName", "assigneeName", "agentName", "authorName", "contactName", "managerName", "submitterName", "displayName"];
  const orgFields = ["organizationName", "organization", "clientName", "customerName"];
  const emailFields = ["requesterEmail", "email"];

  for (const f of orgFields) { if (result[f]) result[f] = register(map, result[f], "org", "ORG_"); }
  for (const f of personFields) { if (result[f]) result[f] = register(map, result[f], "person", "PERSONNE_"); }
  for (const f of emailFields) { if (result[f]) result[f] = register(map, result[f], "email", "email_"); }
  if (result.phone) result.phone = register(map, result.phone, "phone", "TEL_");
  if (result.domain) result.domain = register(map, result.domain, "domain", "domaine_");
  if (result.address) result.address = register(map, result.address, "address", "ADRESSE_");

  // Recurse into comments array
  if (Array.isArray(result.comments)) result.comments = result.comments.map((c: any) => anonymizeRecord(map, c));

  return result;
}

// ===========================================================================
// Debug stats (never sent to AI)
// ===========================================================================
export function getAnonymizationStats(map: AnonymizationMap) {
  return { total: map.forward.size, ...map.counters };
}
