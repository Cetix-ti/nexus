// Document React rendu côté serveur → capturé en PDF par Puppeteer.
// Tailwind, aucune logique client. Structure print-friendly.

import type { DossierPayload } from "@/lib/reports/dossier/builder";

const CAPABILITY_LABELS: Record<string, string> = {
  hasAD: "Active Directory local", hasAzureAD: "Azure AD (legacy)", hasEntra: "Microsoft Entra",
  hasM365: "Microsoft 365", hasExchangeOnPrem: "Exchange on-prem", hasVPN: "VPN",
  hasRDS: "Bureau à distance", hasHyperV: "Hyper-V", hasVMware: "VMware",
  hasOnPremServers: "Serveurs on-prem", hasBackupsVeeam: "Sauvegardes Veeam",
  hasSOC: "SOC / Cybersécurité", hasMDM: "MDM", hasKeePass: "KeePass",
  allowEnglishUI: "Interface anglaise autorisée",
};

const SUBCAT_LABELS: Record<string, string> = {
  PWD_AD: "Politique mot de passe AD", PWD_ENTRA: "Politique mot de passe Entra",
  M365_ROLES: "Rôles M365 / Entra", BACKUP_REPLICATION: "Sauvegardes & réplication",
  OTHER: "Autre politique",
};

const CHANGE_CAT_LABELS: Record<string, string> = {
  INFRASTRUCTURE: "Infrastructure", NETWORK_SECURITY: "Réseau & sécurité",
  IDENTITY_ACCESS: "Identités & accès", M365_CLOUD: "M365 & cloud",
  SOFTWARE: "Logiciels", BACKUPS: "Sauvegardes", WORKSTATIONS: "Postes",
  TELECOM_PRINT: "Téléphonie / Impression", CONTRACTS: "Contrats",
  ORGANIZATIONAL: "Organisationnel", OTHER: "Autre",
};

const IMPACT_COLORS: Record<string, string> = {
  MINOR: "#64748b", MODERATE: "#2563eb", MAJOR: "#d97706", STRUCTURAL: "#dc2626",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function ClientDossierDocument({ payload, logoSrc }: { payload: DossierPayload; logoSrc: string }) {
  const { org, capabilities, sites, mainContacts, maturity, particularities, software, policies, changes12m, renewals180d, activeContracts, contactsCount, generatedAt } = payload;
  const scoreColor = maturity.score >= 80 ? "#059669" : maturity.score >= 50 ? "#d97706" : "#dc2626";

  return (
    <div style={{ fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif", color: "#1e293b", fontSize: "11pt", lineHeight: 1.5, padding: "0 4mm" }}>
      <style>{`
        @page { size: Letter; margin: 15mm 12mm; }
        h1 { font-size: 20pt; margin: 0 0 4mm 0; font-weight: 700; color: #0f172a; }
        h2 { font-size: 14pt; margin: 6mm 0 3mm 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2mm; page-break-after: avoid; }
        h3 { font-size: 11pt; margin: 3mm 0 1.5mm 0; font-weight: 600; color: #334155; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        td, th { padding: 2mm 3mm; text-align: left; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
        th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        .card { border: 1px solid #e2e8f0; border-radius: 2mm; padding: 3mm; background: #fafafa; }
        .chip { display: inline-block; padding: 0.3mm 1.5mm; border-radius: 1mm; font-size: 8pt; font-weight: 500; margin-right: 1mm; }
        .muted { color: #64748b; font-size: 9pt; }
        .avoid-break { page-break-inside: avoid; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6mm", paddingBottom: "4mm", borderBottom: "2px solid #0f172a" }}>
        <div>
          <h1>Dossier client 360°</h1>
          <div style={{ fontSize: "13pt", color: "#334155", fontWeight: 600 }}>{org.name}</div>
          <div className="muted">
            {org.domain && <>Domaine : {org.domain}{org.clientCode && " · "}</>}
            {org.clientCode && <>Code client : {org.clientCode}</>}
          </div>
        </div>
        <img src={logoSrc} alt="Cetix" style={{ height: "14mm", width: "auto" }} />
      </div>
      <div className="muted" style={{ marginBottom: "5mm" }}>Généré le {fmtDate(generatedAt)}</div>

      {/* Score maturité + chiffres clés */}
      <div className="grid avoid-break">
        <div className="card">
          <h3>Score de maturité</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
            <div style={{ fontSize: "32pt", fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{maturity.score}%</div>
            <div className="muted" style={{ fontSize: "9pt" }}>
              {maturity.passedCount} sur {maturity.applicableCount} critères applicables validés
            </div>
          </div>
          {maturity.failedTitles.length > 0 && (
            <div style={{ marginTop: "2mm" }}>
              <div className="muted" style={{ fontSize: "8.5pt", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Points à compléter</div>
              <ul style={{ margin: "1mm 0 0 0", paddingLeft: "4mm", fontSize: "9.5pt" }}>
                {maturity.failedTitles.slice(0, 5).map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Chiffres clés</h3>
          <table>
            <tbody>
              <tr><td className="muted">Sites</td><td style={{ textAlign: "right", fontWeight: 600 }}>{sites.length}</td></tr>
              <tr><td className="muted">Contacts</td><td style={{ textAlign: "right", fontWeight: 600 }}>{contactsCount}</td></tr>
              <tr><td className="muted">Particularités</td><td style={{ textAlign: "right", fontWeight: 600 }}>{particularities.length}</td></tr>
              <tr><td className="muted">Logiciels</td><td style={{ textAlign: "right", fontWeight: 600 }}>{software.length}</td></tr>
              <tr><td className="muted">Politiques</td><td style={{ textAlign: "right", fontWeight: 600 }}>{policies.length}</td></tr>
              <tr><td className="muted">Changements 12 mois</td><td style={{ textAlign: "right", fontWeight: 600 }}>{changes12m.length}</td></tr>
              <tr><td className="muted">Contrats actifs</td><td style={{ textAlign: "right", fontWeight: 600 }}>{activeContracts.length}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Environnement technique */}
      <h2>Environnement technique</h2>
      {capabilities ? (
        <div className="grid avoid-break">
          {Object.entries(CAPABILITY_LABELS).map(([k, label]) => (
            <div key={k} style={{ fontSize: "9.5pt", display: "flex", alignItems: "center", gap: "2mm" }}>
              <span style={{ width: "2.5mm", height: "2.5mm", borderRadius: "50%", background: capabilities[k] ? "#059669" : "#cbd5e1", display: "inline-block" }} />
              <span style={{ color: capabilities[k] ? "#0f172a" : "#94a3b8" }}>{label}</span>
            </div>
          ))}
        </div>
      ) : <div className="muted">Non renseigné.</div>}

      {/* Sites */}
      {sites.length > 0 && (
        <>
          <h2>Sites</h2>
          <table>
            <thead><tr><th>Nom</th><th>Adresse</th><th>Ville</th></tr></thead>
            <tbody>
              {sites.map((s, i) => (
                <tr key={i}>
                  <td>{s.name}{s.isMain && <span className="chip" style={{ marginLeft: "1mm", background: "#dbeafe", color: "#1e40af" }}>principal</span>}</td>
                  <td>{s.address ?? "—"}</td>
                  <td>{s.city ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Contacts clés */}
      {mainContacts.length > 0 && (
        <>
          <h2>Contacts clés</h2>
          <table>
            <thead><tr><th>Nom</th><th>Fonction</th><th>Email</th></tr></thead>
            <tbody>
              {mainContacts.map((c, i) => (
                <tr key={i}><td>{c.firstName} {c.lastName}</td><td>{c.jobTitle ?? "—"}</td><td>{c.email}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Particularités */}
      {particularities.length > 0 && (
        <>
          <h2>Particularités ({particularities.length})</h2>
          <table>
            <thead><tr><th>Catégorie</th><th>Titre</th><th>Résumé</th></tr></thead>
            <tbody>
              {particularities.map((p, i) => (
                <tr key={i} className="avoid-break">
                  <td style={{ fontSize: "9pt", color: "#64748b", whiteSpace: "nowrap" }}>{p.categoryName ?? "—"}</td>
                  <td style={{ fontWeight: 500 }}>{p.title}</td>
                  <td style={{ fontSize: "9.5pt" }}>{p.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Logiciels */}
      {software.length > 0 && (
        <>
          <h2>Logiciels principaux ({software.length})</h2>
          <table>
            <thead><tr><th>Catégorie</th><th>Logiciel</th><th>Éditeur</th><th>Version</th></tr></thead>
            <tbody>
              {software.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontSize: "9pt", color: "#64748b", whiteSpace: "nowrap" }}>{s.categoryName ?? "—"}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td>{s.vendor ?? "—"}</td>
                  <td className="muted">{s.version ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Politiques */}
      {policies.length > 0 && (
        <>
          <h2>Politiques documentées ({policies.length})</h2>
          <table>
            <thead><tr><th>Type</th><th>Titre</th><th>Résumé</th></tr></thead>
            <tbody>
              {policies.map((p, i) => (
                <tr key={i} className="avoid-break">
                  <td style={{ fontSize: "9pt", color: "#64748b", whiteSpace: "nowrap" }}>{SUBCAT_LABELS[p.subcategory] ?? p.subcategory}</td>
                  <td style={{ fontWeight: 500 }}>{p.title}</td>
                  <td style={{ fontSize: "9.5pt" }}>{p.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Changements 12 mois */}
      {changes12m.length > 0 && (
        <>
          <h2>Changements significatifs (12 derniers mois)</h2>
          <table>
            <thead><tr><th>Date</th><th>Catégorie</th><th>Impact</th><th>Titre</th></tr></thead>
            <tbody>
              {changes12m.map((c, i) => (
                <tr key={i} className="avoid-break">
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateShort(c.changeDate)}</td>
                  <td style={{ fontSize: "9pt", color: "#64748b", whiteSpace: "nowrap" }}>{CHANGE_CAT_LABELS[c.category] ?? c.category}</td>
                  <td><span className="chip" style={{ background: IMPACT_COLORS[c.impact] + "22", color: IMPACT_COLORS[c.impact] }}>{c.impact}</span></td>
                  <td>{c.title}{c.summary && <div className="muted" style={{ fontSize: "8.5pt", marginTop: "0.5mm" }}>{c.summary}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Renouvellements */}
      {renewals180d.length > 0 && (
        <>
          <h2>Échéances à venir (180 jours)</h2>
          <table>
            <thead><tr><th>Échéance</th><th>Type</th><th>Objet</th></tr></thead>
            <tbody>
              {renewals180d.map((r, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateShort(r.endDate)}</td>
                  <td style={{ fontSize: "9pt", color: "#64748b", whiteSpace: "nowrap" }}>
                    {r.type === "warranty" ? "Garantie" : r.type === "subscription" ? "Abonnement" : r.type === "support_contract" ? "Support" : "Licence"}
                  </td>
                  <td>{r.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Contrats actifs */}
      {activeContracts.length > 0 && (
        <>
          <h2>Contrats actifs ({activeContracts.length})</h2>
          <table>
            <thead><tr><th>Nom</th><th>Type</th><th>Début</th><th>Fin</th></tr></thead>
            <tbody>
              {activeContracts.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="muted">{c.type}</td>
                  <td className="muted">{fmtDateShort(c.startDate)}</td>
                  <td className="muted">{c.endDate ? fmtDateShort(c.endDate) : "Ouverte"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
