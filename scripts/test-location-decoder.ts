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
  { id: "u-sf", firstName: "Simon", lastName: "Fréchette", isActive: true },
  { id: "u-mv", firstName: "Maëva", lastName: "Vigier", isActive: true },
];

const orgs: DecodableOrg[] = [
  { id: "o-cetix", name: "Cetix", clientCode: "CTX", isInternal: true },
  { id: "o-lv", name: "Ville de Louiseville", clientCode: "LV", isInternal: false },
  { id: "o-vdsa", name: "Ville de Sainte-Adèle", clientCode: "VDSA", isInternal: false },
  { id: "o-sadb", name: "Ville de Sainte-Anne-de-Bellevue", clientCode: "SADB", isInternal: false },
  { id: "o-mrvl", name: "Ville de Marieville", clientCode: "MRVL", isInternal: false },
  { id: "o-mtlo", name: "Ville de Montréal-Ouest", clientCode: "MTLO", isInternal: false },
  { id: "o-dlsn", name: "Ville de Delson", clientCode: "DLSN", isInternal: false },
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

console.log("\n--- Titres avec horaire parasite ---");
{
  const r = decodeLocationTitle("MG SADB 15h", agents, orgs);
  assert(
    "MG SADB 15h → Marcel + SADB (15h ignoré)",
    r.ok && r.agents[0].id === "u-mg" && r.organizationName === "Ville de Sainte-Anne-de-Bellevue",
    r,
  );
}
{
  const r = decodeLocationTitle("BR LV 8h-17h", agents, orgs);
  assert("BR LV 8h-17h → plage horaire ignorée", r.ok && r.agents[0].id === "u-br", r);
}
{
  const r = decodeLocationTitle("JT VDSA 15:30", agents, orgs);
  assert("JT VDSA 15:30 → format HH:MM ignoré", r.ok && r.agents[0].id === "u-jt", r);
}
{
  const r = decodeLocationTitle("MG/VG MRVL 9h", agents, orgs);
  assert("MG/VG MRVL 9h → multi-agents + horaire", r.ok && r.agents.length === 2, r);
}
{
  const r = decodeLocationTitle("KR BUREAU 14h", agents, orgs);
  assert("KR BUREAU 14h → BUREAU reste office", r.ok && r.locationKind === "office", r);
}
{
  const r = decodeLocationTitle("BR LV 3pm", agents, orgs);
  assert("BR LV 3pm → format anglo ignoré", r.ok && r.agents[0].id === "u-br", r);
}

console.log("\n--- Casse / accents ---");
{
  const r = decodeLocationTitle("br lv", agents, orgs);
  assert("minuscules tolérées", r.ok && r.agents[0].id === "u-br", r);
}

console.log("\n--- Cas intelligents demandés par l'utilisateur ---");
{
  // 1. "MG/VG MTLO EN PM" → Marcel + Vincent chez MTLO, "EN PM" ignoré.
  const r = decodeLocationTitle("MG/VG MTLO EN PM", agents, orgs);
  assert(
    "MG/VG MTLO EN PM → 2 agents + Montréal-Ouest",
    r.ok &&
      r.agents.length === 2 &&
      r.agents.map((a) => a.id).sort().join(",") === "u-mg,u-vg" &&
      r.organizationName === "Ville de Montréal-Ouest",
    r,
  );
}
{
  // 2. "MV RDV NOTAIRE" → MV (Maëva) en personnel, pas de client.
  const r = decodeLocationTitle("MV RDV NOTAIRE", agents, orgs);
  assert(
    "MV RDV NOTAIRE → personal, agent MV, pas d'org",
    r.ok && r.agents[0].id === "u-mv" && r.locationKind === "personal" && r.organizationId === null,
    r,
  );
}
{
  // 3. "CTX BUREAU (OBLIGATOIRE)" → company_meeting chez Cetix.
  const r = decodeLocationTitle("CTX BUREAU (OBLIGATOIRE)", agents, orgs);
  assert(
    "CTX BUREAU (OBLIGATOIRE) → company_meeting, pas d'agent spécifique",
    r.ok &&
      r.locationKind === "company_meeting" &&
      r.agents.length === 0 &&
      r.organizationName === "Cetix",
    r,
  );
}
{
  // 4a. "SF OFF" → Simon Fréchette, personal (OFF = off-work).
  const r = decodeLocationTitle("SF OFF", agents, orgs);
  assert(
    "SF OFF → personal, Simon",
    r.ok && r.agents[0].id === "u-sf" && r.locationKind === "personal",
    r,
  );
}
{
  // 4b. "SF DENTISTE" → SF personal.
  const r = decodeLocationTitle("SF DENTISTE", agents, orgs);
  assert(
    "SF DENTISTE → personal, Simon",
    r.ok && r.agents[0].id === "u-sf" && r.locationKind === "personal",
    r,
  );
}
{
  // 5. "JT VDSA (8H00)" → Jacques + VDSA, "(8H00)" strippé.
  const r = decodeLocationTitle("JT VDSA (8H00)", agents, orgs);
  assert(
    "JT VDSA (8H00) → Jacques + Sainte-Adèle, heure ignorée",
    r.ok &&
      r.agents[0].id === "u-jt" &&
      r.organizationName === "Ville de Sainte-Adèle",
    r,
  );
}
{
  // 6. "MG/SF O365 MRVL" → Marcel + Simon + MRVL, O365 noté en partial.
  const r = decodeLocationTitle("MG/SF O365 MRVL", agents, orgs);
  assert(
    "MG/SF O365 MRVL → 2 agents + Marieville, O365 partial",
    r.ok &&
      r.agents.length === 2 &&
      r.agents.map((a) => a.id).sort().join(",") === "u-mg,u-sf" &&
      r.organizationName === "Ville de Marieville" &&
      r.unknownAgentTokens?.includes("O365") === true,
    r,
  );
}
{
  // 7. "MG/VGDLSN" → un-glue "VGDLSN" en "VG" + "DLSN" (pas d'espace
  //    oublié dans le titre entre le dernier agent et le code client).
  const r = decodeLocationTitle("MG/VGDLSN", agents, orgs);
  assert(
    "MG/VGDLSN → MG + VG + Delson (un-glue)",
    r.ok &&
      r.agents.length === 2 &&
      r.agents.map((a) => a.id).sort().join(",") === "u-mg,u-vg" &&
      r.organizationName === "Ville de Delson",
    r,
  );
}
{
  // 8. "BR/JTVDSA" — même motif avec JT en DB + VDSA.
  const r = decodeLocationTitle("BR/JTVDSA", agents, orgs);
  assert(
    "BR/JTVDSA → BR + JT + Sainte-Adèle (un-glue)",
    r.ok &&
      r.agents.length === 2 &&
      r.agents.map((a) => a.id).sort().join(",") === "u-br,u-jt" &&
      r.organizationName === "Ville de Sainte-Adèle",
    r,
  );
}
{
  // 9. "MG/SFBUREAU" — un-glue avec mot-clé office.
  const r = decodeLocationTitle("MG/SFBUREAU", agents, orgs);
  assert(
    "MG/SFBUREAU → MG + SF + Cetix (un-glue + office)",
    r.ok &&
      r.agents.length === 2 &&
      r.locationKind === "office" &&
      r.organizationName === "Cetix",
    r,
  );
}

console.log("\n--- Match partiel (1/2 agents inconnus) ---");
{
  // BR existe, XY n'existe pas → on accepte BR + note XY en unknownAgentTokens
  const r = decodeLocationTitle("BR/XY LV", agents, orgs);
  assert("partiel → ok", r.ok, r);
  assert("partiel → 1 agent (BR)", r.ok && r.agents.length === 1 && r.agents[0].id === "u-br", r);
  assert(
    "partiel → unknownAgentTokens=[XY]",
    r.ok && r.unknownAgentTokens?.includes("XY") === true,
    r,
  );
  assert("partiel → org LV trouvée", r.ok && r.organizationName === "Ville de Louiseville", r);
}

console.log("\n--- Erreurs ---");
{
  const r = decodeLocationTitle("", agents, orgs);
  assert("titre vide → EMPTY", !r.ok && r.reason === "EMPTY");
}
{
  const r = decodeLocationTitle("XY LV", agents, orgs);
  assert("tous inconnus → UNKNOWN_AGENTS", !r.ok && r.reason === "UNKNOWN_AGENTS", r);
}
{
  // Lieu inconnu + agent connu → fallback "personal" (pas UNKNOWN_LOCATION).
  // C'est le comportement voulu pour "MV RDV NOTAIRE" etc.
  const r = decodeLocationTitle("BR ZZZ", agents, orgs);
  assert(
    "lieu inconnu + agent connu → fallback personal",
    r.ok && r.locationKind === "personal" && r.agents[0].id === "u-br",
    r,
  );
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
