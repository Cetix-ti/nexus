// ============================================================================
// PERSISTENCE EMAIL PARSER — porté du node n8n "Parse Wazuh Email".
//
// Wazuh envoie des notifications dont le format est stable depuis plusieurs
// années :
//   Subject: "Wazuh notification - (HOSTNAME) IP->module - Alert level N"
//   Body:    "... Rule: 123 fired (level 7) -> "description installed on : TeamViewer 15.75.5""
//
// On extrait hostname, clientCode (préfixe du hostname), IP, module, Rule ID,
// Rule Level, description, puis on isole le nom de logiciel et sa version.
// ============================================================================

export interface ParsedPersistenceEmail {
  rawSubject: string;
  rawBodyPreview: string;
  normalizedBody: string;
  hostname: string;
  clientCode: string;
  ipAddress: string;
  moduleName: string;
  alertLevel: number;
  ruleId: string;
  ruleLevel: number;
  ruleDescription: string;
  softwareNameRaw: string;
  softwareName: string;
  softwareVersion: string;
  isServer: boolean;
}

/**
 * Parse une notification Wazuh syscollector. Retourne null si le format ne
 * correspond pas (sujet non reconnu) — l'appelant passera alors au décodeur
 * Wazuh générique.
 */
export function parsePersistenceEmail(opts: {
  subject: string;
  bodyPreview: string;
}): ParsedPersistenceEmail | null {
  const subject = opts.subject || "";
  const bodyPreview = opts.bodyPreview || "";

  const normalizedBody = bodyPreview
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Sujet Wazuh : "Wazuh notification - (MRVL_MV-LAP-33) 10.123.41.24->syscollector - Alert level 12"
  const subjectMatch = subject.match(
    /Wazuh notification - \((.*?)\)\s+([0-9.]+)->(.*?) - Alert level (\d+)/i,
  );
  if (!subjectMatch) return null;

  const hostname = subjectMatch[1] || "";
  const clientCode = hostname.includes("_") ? hostname.split("_")[0] : "UNKNOWN";
  const ipAddress = subjectMatch[2] || "";
  const moduleName = subjectMatch[3] || "";
  const alertLevel = Number(subjectMatch[4] || 0);

  const ruleIdMatch = normalizedBody.match(/Rule:\s*(\d+)/i);
  const ruleLevelMatch = normalizedBody.match(/fired\s*\(level\s*(\d+)\s*\)/i);
  const ruleId = ruleIdMatch?.[1] || "";
  const ruleLevel = Number(ruleLevelMatch?.[1] || 0);

  // Description entre guillemets après la flèche "->"
  let ruleDescription = "";
  const descMatch =
    normalizedBody.match(/->\s*"(.+?)"(?=\s|$)/i) ||
    normalizedBody.match(/->\s*"(.+)$/i) ||
    normalizedBody.match(/->\s*(.+)$/i);
  if (descMatch) ruleDescription = descMatch[1].trim();

  // "installed on : SOFT VERSION"
  let softwareRaw = "";
  const softwareMatch = ruleDescription.match(/installed on\s*:\s*(.+)$/i);
  if (softwareMatch) softwareRaw = softwareMatch[1].trim();
  softwareRaw = softwareRaw.replace(/^"+|"+$/g, "").trim();

  let softwareName = softwareRaw;
  let softwareVersion = "";

  // Cas "TeamViewer 15.75.5"
  const fullVersionMatch = softwareRaw.match(/^(.*?)[\s]+([0-9]+(?:\.[0-9]+){1,})$/);
  // Cas tronqué "ScreenConnect Client (...) 26."
  const truncatedVersionMatch = softwareRaw.match(/^(.*?)[\s]+([0-9]+\.)$/);

  if (fullVersionMatch && !softwareRaw.toLowerCase().includes("screenconnect client (")) {
    softwareName = fullVersionMatch[1].trim();
    softwareVersion = fullVersionMatch[2].trim();
  } else if (truncatedVersionMatch) {
    softwareName = truncatedVersionMatch[1].trim();
  }

  const hostnameUpper = hostname.toUpperCase();
  const isServer =
    hostnameUpper.includes("SRV") ||
    hostnameUpper.includes("SER") ||
    hostnameUpper.includes("DC");

  return {
    rawSubject: subject,
    rawBodyPreview: bodyPreview,
    normalizedBody,
    hostname,
    clientCode,
    ipAddress,
    moduleName,
    alertLevel,
    ruleId,
    ruleLevel,
    ruleDescription,
    softwareNameRaw: softwareRaw,
    softwareName,
    softwareVersion,
    isServer,
  };
}
