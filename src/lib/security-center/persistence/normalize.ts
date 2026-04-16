// ============================================================================
// PERSISTENCE SOFTWARE NORMALIZATION — porté du node n8n "Normalize Software
// Name" (workflow Bitdefender - persistence software alerts).
//
// Les agents Wazuh syscollector renvoient des noms bruts très variables :
//   "TeamViewer", "TeamViewer 15", "TeamViewerQS", "TV QuickSupport"
// on les ramène à un nom canonique stable pour la clé de whitelist et pour
// le grouping dans l'UI. Ajouter un case quand un nouveau soft apparaît.
// ============================================================================

interface Rule {
  canonical: string;
  needles: string[];
}

const RULES: Rule[] = [
  { canonical: "ScreenConnect", needles: ["screenconnect", "connectwise control", "connectwisecontrol"] },
  { canonical: "TeamViewer", needles: ["teamviewer", "quicksupport", "teamviewerqs"] },
  { canonical: "AnyDesk", needles: ["anydesk"] },
  { canonical: "Splashtop", needles: ["splashtop"] },
  { canonical: "RustDesk", needles: ["rustdesk"] },
  { canonical: "VNC", needles: ["tightvnc", "ultravnc", "realvnc", "tigervnc", "vnc connect", "vnc server", "vnc viewer", "vnc"] },
  { canonical: "NoMachine", needles: ["nomachine"] },
  { canonical: "RemotePC", needles: ["remotepc"] },
  { canonical: "LogMeIn", needles: ["logmein"] },
  { canonical: "GoTo", needles: ["gotoassist", "goto resolve"] },
  { canonical: "BeyondTrust", needles: ["beyondtrust", "bomgar"] },
  { canonical: "Zoho Assist", needles: ["zoho assist"] },
  { canonical: "Dameware", needles: ["dameware"] },
  { canonical: "Remote Utilities", needles: ["remote utilities"] },
  { canonical: "AeroAdmin", needles: ["aeroadmin"] },
  { canonical: "Supremo", needles: ["supremo"] },
  { canonical: "DWService", needles: ["dwservice"] },
  { canonical: "Parsec", needles: ["parsec"] },
  { canonical: "Ammyy", needles: ["ammyy"] },
  { canonical: "ShowMyPC", needles: ["showmypc"] },
  { canonical: "pcvisit", needles: ["pcvisit"] },
  { canonical: "LiteManager", needles: ["litemanager"] },
  { canonical: "Radmin", needles: ["radmin"] },
  { canonical: "SimpleHelp", needles: ["simplehelp"] },
  { canonical: "Mikogo", needles: ["mikogo"] },
  { canonical: "ISL Online", needles: ["isl online", "islonline"] },
  { canonical: "NetSupport", needles: ["netsupport"] },
  { canonical: "Goverlan", needles: ["goverlan"] },
  { canonical: "MeshCentral", needles: ["meshcentral", "mesh agent", "meshagent"] },
  { canonical: "Netop", needles: ["netop"] },
  { canonical: "Remote Desktop Manager", needles: ["remote desktop manager"] },
];

/**
 * Retourne le nom canonique si on reconnaît le soft, sinon retourne le
 * raw tel quel (préserve la capitalisation originale pour l'affichage).
 */
export function normalizeSoftwareName(raw: string): string {
  if (!raw) return raw;
  const needle = raw.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.needles.some((n) => needle.includes(n))) return rule.canonical;
  }
  return raw;
}

/**
 * Liste des softs canoniques pour UI (autocomplete whitelist).
 */
export function listCanonicalSoftware(): string[] {
  return RULES.map((r) => r.canonical);
}
