// Smoke-tests pour le décodeur de titre "Localisation".
// Run: npx tsx scripts/test-location-decoder.ts

import {
  decodeLocationTitle,
  encodeLocationTitle,
  agentInitials,
  type DecodableAgent,
  type DecodableOrg,
} from "../src/lib/calendar/location-decoder";

const agents: DecodableAgent[] = [
  { id: "u-br", firstName: "Bruno", lastName: "Robert", isActive: true },
  { id: "u-jt", firstName: "Jacques", lastName: "Thibault", isActive: true },
  { id: "u-mg", firstName: "Marcel", lastName: "Gazaille", isActive: true },
  { id: "u-vg", firstName: "Vincent", lastName: "Gazaille", isActive: true },
  { id: "u-kr", firstName: "Koryne", lastName: "Robitaille", isActive: true },
];

const orgs: DecodableOrg[] = [
  { id: "o-cetix", name: "Cetix", clientCode: "CTX", isInternal: true },
  { id: "o-lv", name: "Ville de Louiseville", clientCode: "LV", isInternal: false },
  { id: "o-vdsa", name: "Ville de Sainte-Adèle", clientCode: "VDSA", isInternal: false },
  { id: "o-mrvl", name: "Ville de Marieville", clientCode: "MRVL", isInternal: false },
];

let failures = 0;
function assert(label: string, cond: boolean, ctx?: unknown) {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.log(`✗ ${label}`);
    if (ctx !== undefined) console.log("  context:", JSON.stringify(ctx, null, 2));
    failures++;
  }
}

console.log("\n--- agentInitials ---");
assert("BR", agentInitials(agents[0]) === "BR");
assert("JT", agentInitials(agents[1]) === "JT");

console.log("\n--- Cas simples ---");
{
  const r = decodeLocationTitle("BR LV", agents, orgs);
  assert("BR LV ok", r.ok && r.agents[0].id === "u-br", r);
  assert("BR LV → VLL", r.ok && r.organizationName === "Ville de Louiseville", r);
  assert("BR LV → client", r.ok && r.locationKind === "client", r);
}
{
  const r = decodeLocationTitle("JT VDSA", agents, orgs);
  assert("JT VDSA ok", r.ok && r.agents[0].id === "u-jt", r);
}

console.log("\n--- Multi-agents ---");
{
  const r = decodeLocationTitle("MG/VG MRVL", agents, orgs);
  assert("MG/VG MRVL → 2 agents", r.ok && r.agents.length === 2, r);
  assert(
    "MG/VG MRVL → Gazaille & Gazaille",
    r.ok && r.agents.map((a) => a.id).sort().join(",") === "u-mg,u-vg",
    r,
  );
}
{
  const r = decodeLocationTitle("MG+VG MRVL", agents, orgs);
  assert("MG+VG (séparateur +) → 2 agents", r.ok && r.agents.length === 2);
}

console.log("\n--- BUREAU / TÉLÉTRAVAIL ---");
{
  const r = decodeLocationTitle("KR BUREAU", agents, orgs);
  assert("KR BUREAU → Cetix", r.ok && r.organizationName === "Cetix", r);
  assert("KR BUREAU → office", r.ok && r.locationKind === "office", r);
}
{
  const r = decodeLocationTitle("BR TÉLÉTRAVAIL", agents, orgs);
  assert("BR TÉLÉTRAVAIL → remote", r.ok && r.locationKind === "remote", r);
  assert("BR TÉLÉTRAVAIL → no org", r.ok && r.organizationId === null, r);
}
{
  const r = decodeLocationTitle("KR WFH", agents, orgs);
  assert("WFH alias → remote", r.ok && r.locationKind === "remote", r);
}

console.log("\n--- Casse / accents ---");
{
  const r = decodeLocationTitle("br lv", agents, orgs);
  assert("minuscules tolérées", r.ok && r.agents[0].id === "u-br", r);
}

console.log("\n--- Erreurs ---");
{
  const r = decodeLocationTitle("", agents, orgs);
  assert("titre vide → EMPTY", !r.ok && r.reason === "EMPTY");
}
{
  const r = decodeLocationTitle("XY LV", agents, orgs);
  assert("initiales inconnues → UNKNOWN_AGENTS", !r.ok && r.reason === "UNKNOWN_AGENTS", r);
}
{
  const r = decodeLocationTitle("BR ZZZ", agents, orgs);
  assert("lieu inconnu → UNKNOWN_LOCATION", !r.ok && r.reason === "UNKNOWN_LOCATION", r);
}
{
  const r = decodeLocationTitle("BR", agents, orgs);
  assert("pas de lieu → NO_AGENT_BLOCK", !r.ok && r.reason === "NO_AGENT_BLOCK", r);
}

console.log("\n--- Ambiguité ---");
{
  const dupes: DecodableAgent[] = [
    ...agents,
    { id: "u-br2", firstName: "Benoît", lastName: "Roy", isActive: true }, // aussi BR
  ];
  const r = decodeLocationTitle("BR LV", dupes, orgs);
  assert("BR ambigu → AMBIGUOUS", !r.ok && r.reason === "AMBIGUOUS", r);
}

console.log("\n--- encodeLocationTitle (reverse) ---");
{
  const t = encodeLocationTitle({
    agents: [agents[0]], // Bruno Robert
    organization: { clientCode: "LV", isInternal: false },
    locationKind: "client",
  });
  assert("encode BR LV", t === "BR LV", t);
}
{
  const t = encodeLocationTitle({
    agents: [agents[2], agents[3]], // MG + VG
    organization: { clientCode: "MRVL", isInternal: false },
    locationKind: "client",
  });
  assert("encode MG/VG MRVL", t === "MG/VG MRVL", t);
}
{
  const t = encodeLocationTitle({
    agents: [agents[4]],
    organization: { clientCode: "CTX", isInternal: true },
    locationKind: "office",
  });
  assert("encode KR BUREAU (office override CTX code)", t === "KR BUREAU", t);
}

if (failures > 0) {
  console.log(`\n✗ ${failures} tests échoués.`);
  process.exit(1);
}
console.log("\n✓ Tous les tests passent.");
