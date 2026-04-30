// ============================================================================
// MonthlyReportDocument — composant de rendu du rapport mensuel client.
//
// Server component pur : reçoit le payload et rend le HTML statique.
// Utilisé par la page /internal/reports/monthly/[id] (Puppeteer) et peut
// aussi être affiché dans l'app pour aperçu.
//
// Design : direction éditoriale "Service report B2B premium".
//   - Pairing typographique Fraunces (display, serif) + DM Sans (body)
//     + JetBrains Mono (chiffres techniques). Vars chargées par la page
//     de rendu via next/font/google.
//   - Palette warm-paper (#FAFAF6) + ink (#0F172A) + Cetix blue (#1E40AF)
//     + cream (#F5EFDF) + copper accent (#9A4A1F) + sage (#5A7D5E).
//   - Hiérarchie asymétrique : période en grand display serif, KPIs avec
//     un "héros" surdimensionné. Lettre exécutive en couverture intérieure.
//   - Tables : interlignes généreux, hairlines plutôt que bordures
//     épaisses, capitales d'eyebrow pour les en-têtes.
// ============================================================================

import type { MonthlyReportPayload, MonthlyReportTicketBlock } from "@/lib/reports/monthly/types";

// ---------------------------------------------------------------------------
// Palette + tokens — exposés en CSS vars pour cohérence sur tout le doc.
// Direction « tech IT moderne » : blue-forward, accents cyan, neutres slate,
// pas de chaleur cream/copper. Look Vercel/Linear/Stripe.
// ---------------------------------------------------------------------------
const THEME = {
  paper:       "#FFFFFF",
  paperSubtle: "#F8FAFC",  // slate-50, très léger fond pour cards
  ink:         "#0F172A",
  inkSoft:     "#1E293B",
  // Spectre Cetix Blue
  blueDeep:    "#1E3A8A",  // navy 800 — titres, brand fort
  blue:        "#2563EB",  // blue 600 — primary action
  blueBright:  "#3B82F6",  // blue 500 — accents lumineux
  bluePale:    "#DBEAFE",  // blue 100 — fonds doux
  blueIce:     "#EFF6FF",  // blue 50  — sidebars, blocs synthèse
  // Accent tech (cyan/teal) — replace l'ancien copper
  accent:      "#0891B2",  // cyan 600 — eyebrows, mentions techniques
  accentBright:"#22D3EE",  // cyan 400 — highlights
  // Sémantique
  positive:    "#059669",  // emerald 600 — KPI verts, notes résolution
  warning:     "#D97706",  // amber 600 — warnings (sparingly)
  // Neutres
  slate:       "#64748B",  // slate 500 — texte secondaire
  slateLight:  "#94A3B8",  // slate 400 — meta
  hair:        "#E2E8F0",  // slate 200 — séparateurs
  hairLight:   "#F1F5F9",  // slate 100 — alt rows
};

const FONT_DISPLAY = "var(--font-geist), -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const FONT_BODY    = "var(--font-geist), -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const FONT_MONO    = "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace";

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
function fmtHours(hours: number): string {
  // 2 décimales pour respecter les unités de facturation 0.25h (= 15 min).
  // Avant : 1 décimale → 15 min (0.25h) s'arrondissait à "0.3 h" ce qui
  // était trompeur pour le client (perception "facturé 0.3h pour 15 min").
  return `${hours.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} h`;
}
function fmtMinutesAsHours(minutes: number): string {
  // Précision 2 décimales : 15 min = 0.25 h, pas 0.3 h. Cohérent avec
  // les saisies de temps qui sont par tranches de 15 min (0.25h).
  return fmtHours(Math.round((minutes / 60) * 100) / 100);
}
function fmtMoney(amount: number): string {
  return amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}
function fmtMoneyShort(amount: number): string {
  // Pour les KPI : enlève les .00 quand entier pour respirer.
  const isInt = Math.round(amount) === amount;
  return amount.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
function fmtDateFR(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-CA", { day: "2-digit", month: "short" });
}
/** Traduit l'enum DB TicketStatus (en majuscules anglaises) en libellé FR
 *  pour le rendu PDF. Les rapports clients sont en français — on ne veut
 *  jamais voir "NEW" / "IN_PROGRESS" tel quel sur la page. */
function ticketStatusLabel(status: string): string {
  switch (String(status).toUpperCase()) {
    case "NEW":             return "Nouveau";
    case "OPEN":            return "Ouvert";
    case "IN_PROGRESS":     return "En cours";
    case "ON_SITE":         return "Sur place";
    case "PENDING":         return "En attente";
    case "WAITING_CLIENT":  return "En attente du client";
    case "WAITING_VENDOR":  return "En attente d'un fournisseur";
    case "SCHEDULED":       return "Planifié";
    case "RESOLVED":        return "Résolu";
    case "CLOSED":          return "Fermé";
    case "CANCELLED":       return "Annulé";
    case "DELETED":         return "Supprimé";
    default:                return status;
  }
}

function coverageLabel(status: string): string {
  switch (status) {
    case "billable":               return "Facturable";
    case "included_in_contract":   return "Inclus";
    case "deducted_from_hour_bank":return "Banque";
    case "msp_monthly":             return "Forfait";
    case "non_billable":            return "Non facturable";
    case "pending":                 return "En attente";
    default:                        return status;
  }
}

function timeTypeLabel(t: string): string {
  switch (t) {
    case "remote_work":     return "À distance";
    case "onsite_work":     return "Sur place";
    case "travel":          return "Déplacement";
    case "preparation":     return "Préparation";
    case "administration":  return "Administration";
    case "waiting":         return "Attente";
    case "follow_up":       return "Suivi";
    case "internal":        return "Interne";
    case "other":           return "Autre";
    default:                return t;
  }
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Heuristique d'article défini français pour le nom d'une organisation —
// utilisée dans la lettre exécutive pour produire un texte syntaxiquement
// correct. Couvre les cas fréquents du portfolio MSP municipal/B2B QC :
//   - "Ville de X"              → "la Ville de X"
//   - "Municipalité de X"       → "la Municipalité de X"
//   - "Hôpital X" / "Hôtel X"   → "l'Hôpital X" / "l'Hôtel X"
//   - "Université X" / "École X"→ "l'Université X" / "l'École X"
//   - "Agence X"                → "l'Agence X"
//   - "Centre X" / "Collège X"  → "le Centre X" / "le Collège X"
//   - "Cégep X" / "Conseil X"   → "le Cégep X" / "le Conseil X"
//   - Commence par "Les "       → "les …" (déjà dans le nom)
//   - Acronyme (2-6 lettres MAJ)→ pas d'article (ex: "HVAC", "MELS")
//   - Nom propre type "Cetix"   → pas d'article
//
// Cas non couverts (« Chalet des Érables » qui devrait prendre "le")
// retombent sur "pas d'article" — préférable à l'article incorrect.
// ---------------------------------------------------------------------------
function orgWithArticle(name: string, opts?: { capitalize?: boolean }): string {
  const trimmed = name.trim();
  // Acronyme : tout caps, 2-6 lettres, pas d'espace → pas d'article
  if (/^[A-Z]{2,6}$/.test(trimmed)) return trimmed;
  // Déjà préfixé "Les " (ou "les ")
  if (/^Les\s/i.test(trimmed)) {
    return opts?.capitalize ? trimmed.replace(/^Les/, "Les") : trimmed.replace(/^Les/, "les");
  }
  let article: "la" | "le" | "l'" | "" = "";
  if (/^Ville\b|^Municipalité\b|^Société\b|^Commission\b|^Coopérative\b|^Caisse\b|^Compagnie\b/i.test(trimmed)) {
    article = "la";
  } else if (/^Centre\b|^Collège\b|^Cégep\b|^Conseil\b|^Comité\b|^Service\b|^Bureau\b|^Groupe\b|^Ministère\b|^Réseau\b|^Cabinet\b/i.test(trimmed)) {
    article = "le";
  } else if (/^Hôpital\b|^Hôtel\b|^Université\b|^Agence\b|^Académie\b|^École\b|^Église\b|^Office\b|^Institut\b|^Association\b/i.test(trimmed)) {
    article = "l'";
  }
  if (article === "") return trimmed;
  if (opts?.capitalize) {
    const cap = article === "l'" ? "L'" : article.charAt(0).toUpperCase() + article.slice(1);
    return article === "l'" ? `${cap}${trimmed}` : `${cap} ${trimmed}`;
  }
  return article === "l'" ? `l'${trimmed}` : `${article} ${trimmed}`;
}

// ---------------------------------------------------------------------------
// Génère un court paragraphe synthèse pour la lettre exécutive — calculé
// depuis les totaux. Pas d'IA, juste de la composition textuelle.
//
// Le texte s'ADAPTE au modèle de facturation de l'org :
//   - Banque d'heures   → mention brève de la banque, pas de "facturable/inclus"
//                         (les heures sortent du forfait acheté en bloc, le
//                         concept "facturable à la carte" n'a pas de sens).
//   - Forfait/contrat   → "X facturables, Y incluses au contrat" si les deux
//                         existent ; sinon le cas dominant seul.
//   - Aucun forfait     → "X heures livrées" tout court (côté client) ou
//                         "X facturables" (côté agent).
// ---------------------------------------------------------------------------
function executiveSummaryText(
  payload: MonthlyReportPayload,
  opts: { hideRates?: boolean } = {},
): string {
  const t = payload.totals;
  const tripsCount = payload.trips.count;
  // Phrase déplacements pluralisée correctement.
  const tripsPhrase = tripsCount === 0
    ? "aucun déplacement n'a été consigné"
    : tripsCount === 1
      ? "1 déplacement a été consigné"
      : `${tripsCount} déplacements ont été consignés`;
  // Phrase tickets résolus : 0 → "Aucun ticket n'a été…", 1 → "1 ticket a été…",
  // n>1 → "n tickets ont été…". Évite "0 ticket a été résolu" non-naturel en FR.
  const resolved = t.ticketsResolvedCount;
  const resolvedPhrase = resolved === 0
    ? "Aucun ticket n'a été résolu"
    : resolved === 1
      ? "1 ticket a été résolu"
      : `${resolved} tickets ont été résolus`;
  const orgName = orgWithArticle(payload.organization.name);
  const intro = `Au cours de ${payload.period.label}, l'équipe Cetix a livré `
    + `${fmtHours(t.totalHours)} de service à ${orgName}`;

  // Choix du complément du 1er paragraphe selon le modèle de facturation.
  let billingClause: string;
  const hb = payload.hourBankTracking;
  if (hb) {
    // Banque d'heures : pas de "facturable" — tout est déduit du forfait
    // acheté en bloc. Détail complet dans la section dédiée du PDF.
    billingClause = `, déduites de la banque d'heures (forfait ${hb.totalHours} h annuelles).`;
  } else if (opts.hideRates) {
    // Version client sans montants : pas de détail facturable/inclus.
    billingClause = `.`;
  } else {
    // Version interne avec montants — détail seulement si pertinent.
    const hasBillable = t.billableHours > 0;
    const hasCovered = t.coveredHours > 0;
    if (hasBillable && hasCovered) {
      const billableShare = t.totalHours > 0
        ? Math.round((t.billableHours / t.totalHours) * 100)
        : 0;
      billingClause = `, dont ${fmtHours(t.billableHours)} facturables (${billableShare}%) et `
        + `${fmtHours(t.coveredHours)} incluses au contrat.`;
    } else if (hasBillable) {
      billingClause = `, intégralement facturables.`;
    } else if (hasCovered) {
      billingClause = `, intégralement incluses au contrat.`;
    } else {
      // Que du non-facturable (geste commercial total) — rare mais possible.
      billingClause = `.`;
    }
  }

  return `${intro}${billingClause} `
    + `${resolvedPhrase} sur ${t.ticketsTouchedCount} pris en charge, et `
    + `${tripsPhrase} sur la période.`;
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export function MonthlyReportDocument({
  payload,
  logoSrc,
  hideRates = false,
}: {
  payload: MonthlyReportPayload;
  logoSrc: string;
  /** Variante "heures seulement" : masque tous les montants et taux $.
   *  Les libellés (palier, type) restent visibles, ainsi que les durées. */
  hideRates?: boolean;
}) {
  const { organization, period, totals, byAgent, byRequester, trips, tickets } = payload;
  const summary = executiveSummaryText(payload, { hideRates });

  return (
    <>
      {/* Style global du document — appliqué seulement à ce render. */}
      <style>{`
        :root {
          color-scheme: light;
        }
        body, html {
          background: ${THEME.paper};
          color: ${THEME.ink};
          font-family: ${FONT_BODY};
          font-feature-settings: "ss01", "cv11", "tnum" off;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          margin: 0;
        }
        .mrd-display { font-family: ${FONT_DISPLAY}; font-feature-settings: "ss01", "ss03"; }
        .mrd-body    { font-family: ${FONT_BODY}; }
        .mrd-mono    { font-family: ${FONT_MONO}; font-feature-settings: "tnum"; }
        .mrd-eyebrow {
          font-family: ${FONT_BODY};
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 500;
          color: ${THEME.accent};
        }
        .mrd-rule {
          border: 0;
          border-top: 1px solid ${THEME.hair};
          margin: 0;
        }
        .mrd-rule-strong {
          border: 0;
          border-top: 2px solid ${THEME.ink};
          margin: 0;
        }
        /* @page : seul size est honoré ici (les style de composants
           React ne sont pas autoritaires pour les margin). Le réglage
           des marges est fait côté Puppeteer dans pdf.ts. Voir le
           commentaire dans pdf.ts pour le bug Chromium qui force la
           valeur effective à ~10mm horizontal. */
        @page { size: Letter; }
        @media print {
          body { background: ${THEME.paper}; }
        }
      `}</style>

      <div
        className="mrd-body"
        style={{
          background: THEME.paper,
          color: THEME.ink,
          minHeight: "100vh",
          fontSize: "11.5px",
          lineHeight: 1.55,
        }}
      >
        <CoverPage payload={payload} logoSrc={logoSrc} summary={summary} />
        <ExecutiveSummary payload={payload} hideRates={hideRates} />
        <AgentBreakdownSection byAgent={byAgent} totals={totals} hideRates={hideRates} />
        {byRequester.length > 0 && <RequesterSection byRequester={byRequester} />}
        <TripsSection trips={trips} hideRates={hideRates} />
        <TicketsSection tickets={tickets} hideRates={hideRates} />
        {!hideRates && <FinancialSummary totals={totals} trips={trips} />}
        {payload.hourBankTracking ? (
          <HourBankTrackingSection tracking={payload.hourBankTracking} />
        ) : null}
        {payload.recap ? <RecapSection recap={payload.recap} /> : null}
      </div>
    </>
  );
}

// ===========================================================================
// COVER — première page éditoriale, asymétrique, période en hero
// ===========================================================================
function CoverPage({
  payload,
  logoSrc,
  summary,
}: {
  payload: MonthlyReportPayload;
  logoSrc: string;
  summary: string;
}) {
  const { organization, period } = payload;
  return (
    <section
      className="break-after-page"
      style={{
        // Puppeteer applique 18mm sur les bords. Pas de padding latéral
        // interne (sinon double). Vertical : un peu de respiration pour
        // que la grille top/middle/bottom n'embrasse pas exactement les
        // bords de la zone imprimable.
        padding: "0 0 16px",
        minHeight: "calc(100vh - 38mm)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
      }}
    >
      {/* Top bar — eyebrow + logo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="mrd-eyebrow">Rapport mensuel · Service géré</div>
        <img src={logoSrc} alt="Cetix" style={{ height: "32px", objectFit: "contain" }} />
      </div>

      {/* Hero — période en très grand serif + bandeau client */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "32px",
            paddingTop: "40px",
          }}
        >
          {/* Eyebrow et période */}
          <div>
            <div
              className="mrd-eyebrow"
              style={{ marginBottom: "16px", color: THEME.slate }}
            >
              Période
            </div>
            <h1
              className="mrd-display"
              style={{
                fontSize: "76px",
                lineHeight: 0.98,
                fontWeight: 600,
                letterSpacing: "-0.025em",
                color: THEME.ink,
                margin: 0,
                fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
              }}
            >
              {capitalize(period.label)}
            </h1>
          </div>

          {/* Bande client */}
          <div
            style={{
              borderTop: `1px solid ${THEME.hair}`,
              paddingTop: "20px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "baseline",
              gap: "24px",
            }}
          >
            <div>
              <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "6px" }}>
                Préparé pour
              </div>
              <div
                className="mrd-display"
                style={{
                  fontSize: "32px",
                  lineHeight: 1.1,
                  fontWeight: 500,
                  color: THEME.blue,
                  letterSpacing: "-0.015em",
                }}
              >
                {organization.name}
              </div>
              {organization.clientCode ? (
                <div
                  className="mrd-mono"
                  style={{ fontSize: "11px", color: THEME.slate, marginTop: "6px" }}
                >
                  {organization.clientCode}
                </div>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "6px" }}>
                Couverture
              </div>
              <div className="mrd-mono" style={{ fontSize: "12px" }}>
                {fmtDateShort(period.startDate)} — {fmtDateShort(period.endDate)}
              </div>
            </div>
          </div>

          {/* Synthèse exécutive */}
          <div
            style={{
              background: THEME.blueIce,
              borderLeft: `3px solid ${THEME.accent}`,
              padding: "20px 24px",
              marginTop: "12px",
            }}
          >
            <div
              className="mrd-eyebrow"
              style={{ color: THEME.accent, marginBottom: "10px" }}
            >
              Synthèse du mois
            </div>
            <p
              className="mrd-display"
              style={{
                fontSize: "16px",
                lineHeight: 1.55,
                fontWeight: 400,
                color: THEME.inkSoft,
                margin: 0,
                fontVariationSettings: "'opsz' 14",
              }}
            >
              {summary}
            </p>
          </div>
        </div>
      </div>

      {/* Footer — meta */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "24px",
          fontSize: "10px",
          color: THEME.slate,
          paddingTop: "32px",
          borderTop: `1px solid ${THEME.hair}`,
        }}
      >
        <Meta label="Émis le" value={fmtDateFR(payload.generatedAt.slice(0, 10))} />
        <Meta
          label="Contrats actifs"
          value={
            payload.activeContracts.length > 0
              ? payload.activeContracts.map((c) => c.name).join(" · ")
              : "—"
          }
        />
        <Meta label="Document" value="Confidentiel · Indicatif" align="right" />
      </div>
    </section>
  );
}

function Meta({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div style={{ textAlign: align ?? "left" }}>
      <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ color: THEME.ink, fontSize: "11px" }}>{value}</div>
    </div>
  );
}

// ===========================================================================
// SECTION HEADERS
// ===========================================================================
function SectionTitle({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      {eyebrow ? (
        <div className="mrd-eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
        </div>
      ) : null}
      <h2
        className="mrd-display"
        style={{
          fontSize: "30px",
          fontWeight: 500,
          letterSpacing: "-0.018em",
          margin: 0,
          color: THEME.ink,
          fontVariationSettings: "'opsz' 60, 'SOFT' 50",
        }}
      >
        {children}
      </h2>
      <hr className="mrd-rule" style={{ marginTop: "16px" }} />
    </div>
  );
}

function PageSection({
  children,
  breakAfter,
  breakBefore,
}: {
  children: React.ReactNode;
  breakAfter?: boolean;
  breakBefore?: boolean;
}) {
  return (
    <section
      className={[breakAfter ? "break-after-page" : "", breakBefore ? "break-before-page" : ""].join(" ")}
      // Puppeteer applique déjà 18mm sur les 4 bords via page.pdf({ margin }).
      // Padding interne réduit à 8px vertical seulement pour aérer entre
      // sections sans empiler avec la marge externe.
      style={{ padding: "8px 0" }}
    >
      {children}
    </section>
  );
}

// ===========================================================================
// EXECUTIVE SUMMARY — KPIs avec hiérarchie : un héros + secondaires
// ===========================================================================
function ExecutiveSummary({ payload, hideRates }: { payload: MonthlyReportPayload; hideRates?: boolean }) {
  const { totals, trips } = payload;
  const billableShare = totals.totalHours > 0 ? Math.round((totals.billableHours / totals.totalHours) * 100) : 0;
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="01 — En un coup d'œil">Sommaire exécutif</SectionTitle>

      {/* Hero KPI : en mode "$" → montant total ; en mode heures → heures totales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "32px",
          alignItems: "stretch",
          marginBottom: "32px",
        }}
      >
        {hideRates ? (
          <HeroKpi
            label="Heures totales du mois"
            value={fmtHours(totals.totalHours)}
            sub={`${fmtHours(totals.billableHours)} facturables · ${fmtHours(totals.coveredHours)} couvertes`}
          />
        ) : (
          <HeroKpi
            label="Total du mois"
            value={fmtMoneyShort(totals.totalAmount)}
            sub={`${fmtMoney(totals.hoursAmount)} heures + ${fmtMoney(totals.tripsAmount)} déplacements`}
          />
        )}
        <SideKpiStack
          items={[
            { label: "Heures totales", value: fmtHours(totals.totalHours), sub: `${fmtHours(totals.billableHours)} facturables` },
            { label: "Taux facturable", value: `${billableShare}%`, sub: "du temps livré" },
            { label: "Heures couvertes", value: fmtHours(totals.coveredHours), sub: "Contrat / banque", muted: true },
          ]}
        />
      </div>

      {/* Stats secondaires en bande horizontale */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0",
          borderTop: `1px solid ${THEME.hair}`,
          borderBottom: `1px solid ${THEME.hair}`,
          padding: "20px 0",
        }}
      >
        <StatBand label="Tickets créés" value={String(totals.ticketsOpenedCount)} />
        <StatBand label="Tickets résolus" value={String(totals.ticketsResolvedCount)} positive />
        <StatBand label="Tickets touchés" value={String(totals.ticketsTouchedCount)} />
        <StatBand label="Déplacements" value={String(trips.count)} />
      </div>
    </PageSection>
  );
}

function HeroKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        // Gradient subtil navy → bleu Cetix : profondeur sans noir mort.
        background: `linear-gradient(135deg, ${THEME.ink} 0%, ${THEME.blueDeep} 100%)`,
        color: THEME.paper,
        padding: "32px 32px 28px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div>
        <div
          className="mrd-eyebrow"
          style={{ color: THEME.bluePale, marginBottom: "12px" }}
        >
          {label}
        </div>
      </div>
      <div>
        <div
          className="mrd-display"
          style={{
            fontSize: "64px",
            lineHeight: 1,
            fontWeight: 500,
            letterSpacing: "-0.03em",
            color: THEME.blueIce,
            fontVariationSettings: "'opsz' 144, 'SOFT' 30",
          }}
        >
          {value}
        </div>
        {sub ? (
          <div style={{ fontSize: "11px", color: THEME.bluePale, marginTop: "10px", opacity: 0.85 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SideKpiStack({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string; muted?: boolean }>;
}) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            background: it.muted ? THEME.blueIce : "transparent",
            border: it.muted ? "none" : `1px solid ${THEME.hair}`,
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "20px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "4px" }}>
              {it.label}
            </div>
            {it.sub ? (
              <div style={{ fontSize: "10.5px", color: THEME.slate }}>{it.sub}</div>
            ) : null}
          </div>
          <div
            className="mrd-display"
            style={{
              fontSize: "26px",
              fontWeight: 500,
              color: THEME.ink,
              letterSpacing: "-0.02em",
              fontVariationSettings: "'opsz' 36",
            }}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatBand({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div style={{ padding: "0 20px", borderRight: `1px solid ${THEME.hair}` }}>
      <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "6px" }}>
        {label}
      </div>
      <div
        className="mrd-display"
        style={{
          fontSize: "26px",
          fontWeight: 500,
          color: positive ? THEME.positive : THEME.ink,
          letterSpacing: "-0.02em",
          fontVariationSettings: "'opsz' 36",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ===========================================================================
// AGENT BREAKDOWN
// ===========================================================================
function AgentBreakdownSection({
  byAgent,
  totals,
  hideRates,
}: {
  byAgent: MonthlyReportPayload["byAgent"];
  totals: MonthlyReportPayload["totals"];
  hideRates?: boolean;
}) {
  // En variante "heures seulement", on retire les colonnes Taux moy. et
  // Facturé pour ne pas exposer la facturation.
  const moneyCols = hideRates
    ? []
    : [
        { key: "rate", label: "Taux moy.", align: "right" as const, muted: true },
        { key: "billed", label: "Facturé", align: "right" as const, emphasis: true },
      ];
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="02 — Équipe">Répartition par technicien</SectionTitle>
      {byAgent.length === 0 ? (
        <EmptyNote>Aucune heure saisie pour ce mois.</EmptyNote>
      ) : (
        <EditorialTable
          columns={[
            { key: "name", label: "Technicien", width: "30%" },
            { key: "hours", label: "Heures", align: "right" },
            { key: "share", label: "Part", align: "right", muted: true },
            { key: "billable", label: "Facturables", align: "right" },
            ...moneyCols,
          ]}
          rows={byAgent.map((a) => {
            const base: Record<string, string> = {
              id: a.agent.id,
              name: a.agent.fullName,
              hours: fmtHours(a.hours),
              share: `${(a.share * 100).toLocaleString("fr-CA", { maximumFractionDigits: 0 })}%`,
              billable: fmtHours(a.billableHours),
            };
            if (!hideRates) {
              base.rate = a.averageRate != null ? fmtMoney(a.averageRate) : "—";
              base.billed = fmtMoney(a.billedAmount);
            }
            return base;
          })}
          totalRow={{
            name: "Total",
            hours: fmtHours(totals.totalHours),
            share: "—",
            billable: fmtHours(totals.billableHours),
            ...(hideRates ? {} : { rate: "—", billed: fmtMoney(totals.hoursAmount) }),
          }}
        />
      )}
    </PageSection>
  );
}

// ===========================================================================
// REQUESTERS
// ===========================================================================
function RequesterSection({ byRequester }: { byRequester: MonthlyReportPayload["byRequester"] }) {
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="03 — Demandeurs">Tickets par demandeur</SectionTitle>
      <EditorialTable
        columns={[
          { key: "name", label: "Demandeur", width: "30%" },
          { key: "email", label: "Courriel", width: "32%", muted: true },
          { key: "opened", label: "Créés", align: "right" },
          { key: "resolved", label: "Résolus", align: "right" },
          { key: "time", label: "Temps total", align: "right", emphasis: true },
        ]}
        rows={byRequester.map((r) => ({
          id: r.requester.id,
          name: r.requester.fullName,
          email: r.requester.email || "—",
          opened: String(r.ticketsOpenedThisMonth),
          resolved: String(r.ticketsResolvedThisMonth),
          time: fmtMinutesAsHours(r.totalMinutes),
        }))}
      />
    </PageSection>
  );
}

// ===========================================================================
// TRIPS
// ===========================================================================
function TripsSection({
  trips,
  hideRates,
}: {
  trips: MonthlyReportPayload["trips"];
  hideRates?: boolean;
}) {
  // En mode "heures seulement", on masque les montants même si le client
  // est facturable.
  const showBilled = trips.billable && !hideRates;
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="04 — Mobilité">Déplacements</SectionTitle>

      {!trips.billable && trips.nonBillableReason && !hideRates ? (
        <div
          style={{
            background: THEME.blueIce,
            borderLeft: `3px solid ${THEME.blue}`,
            padding: "14px 18px",
            marginBottom: "20px",
            fontSize: "12px",
            color: THEME.inkSoft,
          }}
        >
          {trips.nonBillableReason}
        </div>
      ) : null}

      {trips.count === 0 ? (
        <EmptyNote>Aucun déplacement enregistré ce mois.</EmptyNote>
      ) : (
        <EditorialTable
          columns={[
            { key: "date", label: "Date", width: "12%" },
            { key: "agent", label: "Technicien", width: "22%" },
            { key: "ticket", label: "Ticket", width: "14%", mono: true },
            { key: "subject", label: "Sujet", muted: true },
            // Colonne « Couverture » affichée seulement si l'org a un FTIG
            // actif avec quota déplacements (sinon ftigStatus = "none").
            ...(trips.lines.some((t) => t.ftigStatus && t.ftigStatus !== "none")
              ? [{ key: "coverage", label: "Couverture", width: "14%", align: "left" as const }]
              : []),
            ...(showBilled
              ? [{ key: "billed", label: "Facturé", align: "right" as const, emphasis: true }]
              : []),
          ]}
          rows={trips.lines.map((t, i) => ({
            id: `t${i}`,
            date: fmtDateShort(t.date),
            agent: t.agentName,
            ticket: t.ticketDisplayId ?? "—",
            subject: t.ticketSubject ?? "—",
            ...(t.ftigStatus && t.ftigStatus !== "none"
              ? { coverage: t.ftigStatus === "included" ? "Inclus FTIG" : "Facturé" }
              : {}),
            ...(showBilled
              ? { billed: t.billedAmount != null ? fmtMoney(t.billedAmount) : "—" }
              : {}),
          }))}
        />
      )}
    </PageSection>
  );
}

// ===========================================================================
// TICKETS DETAIL
// ===========================================================================
function TicketsSection({
  tickets,
  hideRates,
}: {
  tickets: MonthlyReportTicketBlock[];
  hideRates?: boolean;
}) {
  return (
    <PageSection>
      <SectionTitle eyebrow="05 — Détail des interventions">Tickets traités</SectionTitle>
      {tickets.length === 0 ? (
        <EmptyNote>Aucun ticket à afficher.</EmptyNote>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {tickets.map((t) => <TicketBlock key={t.ticketId} ticket={t} hideRates={hideRates} />)}
        </div>
      )}
    </PageSection>
  );
}

function TicketBlock({ ticket, hideRates }: { ticket: MonthlyReportTicketBlock; hideRates?: boolean }) {
  return (
    <article
      className="break-inside-avoid"
      style={{
        border: `1px solid ${THEME.hair}`,
        borderTop: `2px solid ${THEME.blue}`,
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", minWidth: 0 }}>
          <span
            className="mrd-mono"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: THEME.blue,
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
          >
            {ticket.displayId}
          </span>
          <h3
            className="mrd-display"
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: THEME.ink,
              margin: 0,
              letterSpacing: "-0.01em",
              fontVariationSettings: "'opsz' 14",
            }}
          >
            {ticket.subject}
          </h3>
        </div>
        <span className="mrd-eyebrow" style={{ color: THEME.slate, whiteSpace: "nowrap" }}>
          {ticketStatusLabel(ticket.status)}
        </span>
      </div>

      {ticket.aiSummary ? (
        <p
          style={{
            margin: "6px 0 0 0",
            fontSize: "11.5px",
            lineHeight: 1.5,
            color: THEME.inkSoft,
            fontStyle: "italic",
          }}
        >
          {ticket.aiSummary}
        </p>
      ) : null}

      <div
        style={{
          marginTop: "6px",
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          fontSize: "11px",
          color: THEME.slate,
        }}
      >
        {ticket.requesterName ? (
          <Meta2 label="Demandeur" value={ticket.requesterName} />
        ) : null}
        <Meta2 label="Temps total" value={fmtMinutesAsHours(ticket.totalMinutes)} mono />
        {!hideRates && ticket.totalAmount > 0 ? <Meta2 label="Facturé" value={fmtMoney(ticket.totalAmount)} mono /> : null}
        {ticket.resolvedAt ? <Meta2 label="Résolu le" value={fmtDateShort(ticket.resolvedAt.slice(0, 10))} /> : null}
      </div>

      {ticket.agents.length > 0 ? (
        <div style={{ marginTop: "4px", fontSize: "11px", color: THEME.slate }}>
          <span className="mrd-eyebrow" style={{ color: THEME.slate }}>Techniciens · </span>
          {ticket.agents.map((a, i) => (
            <span key={a.name}>
              {i > 0 ? " · " : ""}
              <span style={{ color: THEME.ink }}>{a.name}</span>
              <span style={{ color: THEME.slate }}> ({fmtMinutesAsHours(a.minutes)})</span>
            </span>
          ))}
        </div>
      ) : null}

      {ticket.resolutionNote ? (
        <div
          style={{
            marginTop: "8px",
            background: "#ECFDF5",
            borderLeft: `3px solid ${THEME.positive}`,
            padding: "8px 12px",
          }}
        >
          <div className="mrd-eyebrow" style={{ color: THEME.positive, marginBottom: "4px" }}>
            Note de résolution
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "11.5px",
              color: THEME.inkSoft,
              whiteSpace: "pre-wrap",
              lineHeight: 1.45,
            }}
          >
            {ticket.resolutionNote}
          </p>
        </div>
      ) : null}

      {ticket.timeEntries.length > 0 ? (
        <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: `1px solid ${THEME.hair}` }}>
          <div className="mrd-eyebrow" style={{ marginBottom: "6px" }}>
            Interventions ({ticket.timeEntries.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {ticket.timeEntries.map((e, idx) => (
              <div
                key={e.id}
                className="break-inside-avoid"
                style={{
                  background: idx % 2 === 0 ? THEME.blueIce : THEME.paper,
                  border: `1px solid ${THEME.hair}`,
                  borderLeft: `3px solid ${THEME.blue}`,
                  padding: "6px 10px",
                }}
              >
                {/* Ligne 1 : date · agent · durée + couverture à droite. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    gap: "8px",
                    fontSize: "11.5px",
                  }}
                >
                  <span
                    className="mrd-mono"
                    style={{ color: THEME.blue, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.02em" }}
                  >
                    {fmtDateShort(e.date)}
                  </span>
                  <span style={{ color: THEME.hair }}>·</span>
                  <span style={{ color: THEME.ink, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {e.agentName}
                  </span>
                  <span style={{ color: THEME.hair }}>·</span>
                  <span
                    className="mrd-mono"
                    style={{ color: THEME.ink, fontWeight: 700, whiteSpace: "nowrap" }}
                  >
                    {fmtMinutesAsHours(e.durationMinutes)}
                  </span>
                  <span
                    className="mrd-eyebrow"
                    style={{ color: THEME.accent, marginLeft: "auto", whiteSpace: "nowrap" }}
                  >
                    {coverageLabel(e.coverageStatus)}
                  </span>
                </div>

                {/* Ligne 2 : badges contextuels obligatoirement visibles
                    quand un modificateur de tarif s'applique (soir, weekend,
                    urgent, sur place, déplacement). Sans cette ligne le
                    client ne comprenait pas pourquoi le taux horaire varie
                    d'une entrée à l'autre. */}
                {(e.isAfterHours || e.isWeekend || e.isUrgent || e.isOnsite || e.hasTravelBilled || e.timeType) && (
                  <div
                    style={{
                      marginTop: "4px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                      alignItems: "center",
                    }}
                  >
                    {e.timeType && e.timeType !== "remote_work" && e.timeType !== "onsite_work" && (
                      <ContextBadge label={timeTypeLabel(e.timeType)} tone="slate" />
                    )}
                    {e.isOnsite && <ContextBadge label="Sur place" tone="amber" />}
                    {!e.isOnsite && e.timeType === "remote_work" && <ContextBadge label="À distance" tone="slate" />}
                    {e.isAfterHours && <ContextBadge label="Tarif soir" tone="indigo" />}
                    {e.isWeekend && <ContextBadge label="Tarif weekend" tone="purple" />}
                    {e.isUrgent && <ContextBadge label="Tarif urgent" tone="rose" />}
                    {e.hasTravelBilled && (
                      // Note : la durée de trajet (travelDurationMinutes) est
                      // une donnée interne (paie agent) — on ne l'affiche pas
                      // au client. Juste le fait qu'un déplacement a été
                      // facturé.
                      <ContextBadge label="Déplacement facturé" tone="cyan" />
                    )}
                  </div>
                )}

                {/* Ligne 3 : tarif horaire + sous-total montant (toujours
                    affiché si on a un montant). Mis EN ÉVIDENCE pour que
                    le client voie immédiatement quel taux a été appliqué.
                    Masqué en variante "heures seulement". */}
                {!hideRates && ((e.hourlyRate != null && e.hourlyRate > 0) || e.amount != null) ? (
                  <div
                    style={{
                      marginTop: "4px",
                      paddingTop: "4px",
                      borderTop: `1px dashed ${THEME.hair}`,
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "10px",
                      fontSize: "11px",
                    }}
                  >
                    <div>
                      {e.hourlyRate != null && e.hourlyRate > 0 ? (
                        <>
                          <span className="mrd-eyebrow" style={{ color: THEME.slate }}>Taux · </span>
                          <span
                            className="mrd-mono"
                            style={{
                              color: THEME.blueDeep,
                              fontWeight: 700,
                              fontSize: "12px",
                            }}
                          >
                            {fmtMoney(e.hourlyRate)}/h
                          </span>
                        </>
                      ) : (
                        <span className="mrd-eyebrow" style={{ color: THEME.slate }}>Inclus / non facturable</span>
                      )}
                    </div>
                    {e.amount != null && (
                      <div>
                        <span className="mrd-eyebrow" style={{ color: THEME.slate }}>Montant · </span>
                        <span
                          className="mrd-mono"
                          style={{
                            color: THEME.ink,
                            fontWeight: 700,
                            fontSize: "12px",
                          }}
                        >
                          {fmtMoney(e.amount)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Saisie partiellement incluse au forfait : on rend une
                    petite ligne explicite « X h inclus FTIG + Y h × Z $/h ».
                    Sans ça, le client voit « 1.00 h × 75 $/h = 18.75 $ »
                    et croit à une erreur de calcul. */}
                {!hideRates && e.billableMinutes != null && e.billableMinutes > 0 && e.billableMinutes < e.durationMinutes && e.hourlyRate != null && e.hourlyRate > 0 ? (
                  <p
                    style={{
                      marginTop: "3px",
                      marginBottom: 0,
                      fontSize: "10.5px",
                      color: THEME.accent,
                      fontStyle: "italic",
                    }}
                  >
                    {fmtMinutesAsHours(e.durationMinutes - e.billableMinutes)} inclus au forfait FTIG · {fmtMinutesAsHours(e.billableMinutes)} facturé(e)s à {fmtMoney(e.hourlyRate)}/h
                  </p>
                ) : null}
                {/* Note : on n'imprime la ligne « Aucune note saisie » que si
                    une description est absente — la ligne vide est juste du
                    bruit dans les rapports denses. */}
                {e.description ? (
                  <p
                    style={{
                      marginTop: "3px",
                      marginBottom: 0,
                      fontSize: "11px",
                      lineHeight: 1.4,
                      color: THEME.inkSoft,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {e.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {/* Total */}
          <div
            style={{
              marginTop: "6px",
              paddingTop: "6px",
              borderTop: `1px solid ${THEME.hair}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: "11px",
            }}
          >
            <span className="mrd-eyebrow" style={{ color: THEME.slate }}>
              Total ticket
            </span>
            <span
              className="mrd-mono"
              style={{
                color: THEME.ink,
                fontWeight: 600,
                fontSize: "12px",
              }}
            >
              {fmtMinutesAsHours(ticket.totalMinutes)}
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Petit badge tinté pour signaler un flag contextuel sur une intervention
 * (Soir, Weekend, Urgent, Sur place, Déplacement). Utilise le même
 * vocabulaire visuel que les eyebrows mais en pastille fermée pour
 * pouvoir en aligner plusieurs côte-à-côte.
 */
function ContextBadge({
  label,
  tone,
}: {
  label: string;
  tone: "indigo" | "purple" | "rose" | "amber" | "cyan" | "slate";
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    indigo: { bg: "#EEF2FF", fg: "#4338CA" }, // soir
    purple: { bg: "#F5F3FF", fg: "#6D28D9" }, // weekend
    rose:   { bg: "#FFF1F2", fg: "#BE123C" }, // urgent
    amber:  { bg: "#FFFBEB", fg: "#B45309" }, // sur place
    cyan:   { bg: "#ECFEFF", fg: "#0E7490" }, // déplacement
    slate:  { bg: "#F1F5F9", fg: "#475569" }, // type de travail / à distance
  };
  const c = tones[tone];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: "9.5px",
        fontWeight: 500,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function Meta2({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span>
      <span className="mrd-eyebrow" style={{ color: THEME.slate }}>{label} · </span>
      <span className={mono ? "mrd-mono" : ""} style={{ color: THEME.ink, fontSize: "11px" }}>{value}</span>
    </span>
  );
}

// ===========================================================================
// FINANCIAL SUMMARY
// ===========================================================================
function FinancialSummary({
  totals,
  trips,
}: {
  totals: MonthlyReportPayload["totals"];
  trips: MonthlyReportPayload["trips"];
}) {
  return (
    <PageSection breakBefore>
      <SectionTitle eyebrow="06 — Récapitulatif">Récapitulatif financier</SectionTitle>
      <div style={{ maxWidth: "440px", marginLeft: "auto" }}>
        <FinancialRow label="Heures facturées" value={fmtMoney(totals.hoursAmount)} />
        {trips.billable ? (
          <FinancialRow label={`Déplacements (${trips.count})`} value={fmtMoney(totals.tripsAmount)} />
        ) : (
          <FinancialRow label={`Déplacements (${trips.count})`} value="Inclus au contrat" muted />
        )}
        <hr className="mrd-rule-strong" style={{ margin: "12px 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "8px 0",
          }}
        >
          <span
            className="mrd-display"
            style={{ fontSize: "16px", fontWeight: 500, color: THEME.ink }}
          >
            Total
          </span>
          <span
            className="mrd-display"
            style={{
              fontSize: "32px",
              fontWeight: 600,
              color: THEME.blue,
              letterSpacing: "-0.02em",
              fontVariationSettings: "'opsz' 36",
            }}
          >
            {fmtMoneyShort(totals.totalAmount)}
          </span>
        </div>
        <div
          style={{
            fontSize: "10px",
            color: THEME.slate,
            fontStyle: "italic",
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: `1px solid ${THEME.hair}`,
          }}
        >
          Montants indicatifs — document généré automatiquement à partir des données saisies.
          La facture officielle peut différer légèrement après réconciliation comptable.
        </div>
      </div>
    </PageSection>
  );
}

function FinancialRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        fontSize: "13px",
        color: muted ? THEME.slate : THEME.ink,
        borderBottom: `1px solid ${THEME.hair}`,
      }}
    >
      <span>{label}</span>
      <span className="mrd-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ===========================================================================
// SHARED — table éditoriale réutilisable
// ===========================================================================
interface EditorialColumn {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right";
  muted?: boolean;
  emphasis?: boolean;
  mono?: boolean;
}
function EditorialTable({
  columns,
  rows,
  totalRow,
}: {
  columns: EditorialColumn[];
  rows: Record<string, string>[];
  totalRow?: Record<string, string>;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${THEME.ink}` }}>
          {columns.map((c) => (
            <th
              key={c.key}
              className="mrd-eyebrow"
              style={{
                textAlign: c.align ?? "left",
                padding: "7px 10px 7px 0",
                color: THEME.ink,
                fontSize: "10px",
                fontWeight: 600,
                width: c.width,
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="break-inside-avoid" style={{ borderBottom: `1px solid ${THEME.hair}` }}>
            {columns.map((c) => (
              <td
                key={c.key}
                className={c.mono ? "mrd-mono" : ""}
                style={{
                  padding: "7px 10px 7px 0",
                  textAlign: c.align ?? "left",
                  color: c.muted ? THEME.slate : THEME.ink,
                  fontWeight: c.emphasis ? 600 : 400,
                  fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
                }}
              >
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
        {totalRow ? (
          <tr style={{ background: THEME.blueIce, borderTop: `1px solid ${THEME.bluePale}` }}>
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  padding: "9px 10px 9px 0",
                  textAlign: c.align ?? "left",
                  color: THEME.ink,
                  fontWeight: 600,
                  fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
                }}
              >
                {totalRow[c.key]}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

// ===========================================================================
// RECAP — synthèse finale orientée HEURES (sans montants $)
//
// Rendue en dernière page, après tickets (et FinancialSummary si version
// agent avec montants). Cinq blocs :
//   1. Heures par couverture (forfait / facturable / non facturable)
//   2. Heures par plage horaire (jour / soir / weekend / urgence)
//   3. Heures par type d'activité (remote / onsite / travel / autre)
//   4. Déplacements (total + ventilation FTIG)
//   5. Graphique heures par catégorie de ticket
//
// Tous les agrégats sont calculés côté builder en excluant le temps
// interne. Le composant ne fait que rendre.
// ===========================================================================
const ACTIVITY_LABELS: Record<string, string> = {
  remote_work: "Travail à distance",
  onsite_work: "Travail sur site",
  travel: "Déplacement",
  other: "Autre",
};

function fmtPct(share: number): string {
  if (share <= 0) return "0 %";
  const v = share * 100;
  // < 1 % mais > 0 → "< 1 %" pour ne pas afficher "0 %" trompeur
  if (v < 1) return "< 1 %";
  return `${v.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} %`;
}

// ===========================================================================
// HOUR BANK TRACKING — suivi du forfait banque d'heures
//
// Section dédiée affichée uniquement quand l'org a une banque d'heures
// configurée (`payload.hourBankTracking` présent). Aide le client à
// visualiser sa consommation cumulée vs son forfait, et à anticiper
// un éventuel dépassement avant qu'il ne survienne.
//
// 3 blocs : statut/progression, histogramme mensuel, projection.
// ===========================================================================
function HourBankTrackingSection({
  tracking,
}: {
  tracking: NonNullable<MonthlyReportPayload["hourBankTracking"]>;
}) {
  const {
    totalHours,
    consumedHours,
    remainingHours,
    consumedShare,
    periodStart,
    periodEnd,
    monthlyHistory,
    targetMonthlyHours,
    averageMonthlyHours,
    projectedTotalHours,
    status,
  } = tracking;

  // Couleurs/labels selon status
  const statusVisual = {
    on_track: { color: THEME.positive, bg: "#ECFDF5", border: "#A7F3D0", icon: "✓", label: "Consommation alignée sur le forfait" },
    warning:  { color: THEME.warning,  bg: "#FFFBEB", border: "#FDE68A", icon: "⚠", label: "Risque de dépassement au rythme actuel" },
    overage:  { color: "#DC2626",       bg: "#FEF2F2", border: "#FECACA", icon: "⚠", label: "Dépassement du forfait" },
    no_data:  { color: THEME.slate,    bg: THEME.hairLight, border: THEME.hair, icon: "·", label: "Aucune heure consommée à ce jour" },
  }[status];

  // Année du forfait : extrait de periodStart pour le titre
  const yearLabel = periodStart.slice(0, 4);

  // Max value pour scaler les barres (au moins le target pour que la
  // ligne cible soit visible même quand peu de heures consommées)
  const maxBarValue = Math.max(
    ...monthlyHistory.map((m) => m.hours),
    targetMonthlyHours * 1.2,
    1,
  );

  // Message contextuel sous le bandeau de statut
  let statusDetail = "";
  if (status === "no_data") {
    statusDetail = `Forfait actif jusqu'au ${formatPeriodEnd(periodEnd)}. Vos heures consommées s'afficheront ici dès la première saisie.`;
  } else if (status === "on_track") {
    const monthsRemaining = countMonthsRemaining(periodEnd);
    if (monthsRemaining > 0 && remainingHours > 0) {
      const paceRemaining = round1(remainingHours / monthsRemaining);
      statusDetail = `Il vous reste ${fmtHours(remainingHours)} pour ${monthsRemaining} mois (${fmtHours(paceRemaining)}/mois en moyenne).`;
    } else {
      statusDetail = `Il vous reste ${fmtHours(remainingHours)} dans le forfait.`;
    }
  } else if (status === "warning") {
    const overshoot = round1(projectedTotalHours - totalHours);
    statusDetail = `Au rythme actuel (${fmtHours(averageMonthlyHours)}/mois), vous atteindriez ${fmtHours(projectedTotalHours)} d'ici la fin du forfait — soit ${fmtHours(overshoot)} hors forfait. Anticipons une ré-évaluation.`;
  } else if (status === "overage") {
    if (consumedHours > totalHours) {
      const over = round1(consumedHours - totalHours);
      statusDetail = `${fmtHours(over)} consommées au-delà du forfait à ce jour.`;
    } else {
      const overshoot = round1(projectedTotalHours - totalHours);
      statusDetail = `Au rythme actuel (${fmtHours(averageMonthlyHours)}/mois), le dépassement projeté est de ${fmtHours(overshoot)}.`;
    }
  }

  return (
    <PageSection breakBefore>
      <SectionTitle eyebrow={`Forfait ${yearLabel}`}>Suivi de la banque d&apos;heures</SectionTitle>

      {/* Bloc 1 — Statut + barre de progression */}
      <div
        className="break-inside-avoid"
        style={{
          marginBottom: "20px",
          padding: "14px 16px",
          background: statusVisual.bg,
          border: `1px solid ${statusVisual.border}`,
          borderRadius: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "10px",
          }}
        >
          <span
            className="mrd-eyebrow"
            style={{ color: statusVisual.color, fontSize: "10px" }}
          >
            Banque d&apos;heures · {totalHours} h
          </span>
          <span
            className="mrd-mono"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: THEME.ink,
            }}
          >
            {fmtHours(consumedHours)} / {totalHours} h
            <span style={{ color: THEME.slate, fontWeight: 400, marginLeft: "8px" }}>
              ({fmtPct(consumedShare)})
            </span>
          </span>
        </div>
        {/* Barre de progression */}
        <div
          style={{
            width: "100%",
            height: "10px",
            background: "#FFFFFF",
            border: `1px solid ${statusVisual.border}`,
            borderRadius: "3px",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, consumedShare * 100)}%`,
              height: "100%",
              background: statusVisual.color,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            fontSize: "11.5px",
            color: THEME.ink,
            lineHeight: 1.45,
          }}
        >
          <span style={{ color: statusVisual.color, fontWeight: 700, flexShrink: 0 }}>
            {statusVisual.icon}
          </span>
          <span>
            <strong>{statusVisual.label}.</strong> {statusDetail}
          </span>
        </div>
      </div>

      {/* Bloc 2 — Histogramme mensuel */}
      <div className="break-inside-avoid" style={{ marginBottom: "20px" }}>
        <h3
          className="mrd-eyebrow"
          style={{ fontSize: "10px", color: THEME.accent, margin: "0 0 12px 0" }}
        >
          Historique mensuel
        </h3>
        <MonthlyBarsChart
          months={monthlyHistory}
          target={targetMonthlyHours}
          maxValue={maxBarValue}
          status={status}
        />
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "20px",
            fontSize: "10px",
            color: THEME.slate,
            flexWrap: "wrap",
          }}
        >
          <span>
            <span style={{ display: "inline-block", width: "10px", height: "3px", background: THEME.blue, verticalAlign: "middle", marginRight: "5px" }} />
            Mois rapporté
          </span>
          <span>
            <span style={{ display: "inline-block", width: "10px", height: "3px", background: THEME.slateLight, verticalAlign: "middle", marginRight: "5px" }} />
            Mois écoulés
          </span>
          <span>
            <span style={{ display: "inline-block", width: "10px", height: "1px", borderTop: `1px dashed ${THEME.slate}`, verticalAlign: "middle", marginRight: "5px" }} />
            Rythme cible ({fmtHours(targetMonthlyHours)}/mois)
          </span>
        </div>
      </div>

      {/* Bloc 3 — Projection (compact) */}
      <div className="break-inside-avoid">
        <h3
          className="mrd-eyebrow"
          style={{ fontSize: "10px", color: THEME.accent, margin: "0 0 10px 0" }}
        >
          Projection fin de période
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${THEME.hairLight}` }}>
              <td style={{ padding: "5px 10px 5px 0", color: THEME.ink }}>Total consommé à ce jour</td>
              <td className="mrd-mono" style={{ padding: "5px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: THEME.ink, fontWeight: 500 }}>
                {fmtHours(consumedHours)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${THEME.hairLight}` }}>
              <td style={{ padding: "5px 10px 5px 0", color: THEME.ink }}>Moyenne mensuelle (mois écoulés)</td>
              <td className="mrd-mono" style={{ padding: "5px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: THEME.ink, fontWeight: 500 }}>
                {fmtHours(averageMonthlyHours)} / mois
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 10px 6px 0", color: THEME.ink, fontWeight: 600 }}>
                Projection au {formatPeriodEnd(periodEnd)}
              </td>
              <td
                className="mrd-mono"
                style={{
                  padding: "6px 0",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  color: status === "overage" ? "#DC2626" : status === "warning" ? THEME.warning : THEME.ink,
                }}
              >
                {fmtHours(projectedTotalHours)}
                {projectedTotalHours > totalHours ? (
                  <span style={{ marginLeft: "6px", fontSize: "10px" }}>
                    (+{fmtHours(round1(projectedTotalHours - totalHours))} hors forfait)
                  </span>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}

// Helpers locaux pour HourBankTrackingSection
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function formatPeriodEnd(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}
function countMonthsRemaining(periodEndIso: string): number {
  const end = new Date(periodEndIso + "T00:00:00");
  const now = new Date();
  if (end < now) return 0;
  const months =
    (end.getFullYear() - now.getFullYear()) * 12 +
    (end.getMonth() - now.getMonth());
  return Math.max(0, months);
}

function MonthlyBarsChart({
  months,
  target,
  maxValue,
  status,
}: {
  months: NonNullable<MonthlyReportPayload["hourBankTracking"]>["monthlyHistory"];
  target: number;
  maxValue: number;
  status: NonNullable<MonthlyReportPayload["hourBankTracking"]>["status"];
}) {
  // Hauteur du graphique en px (rendue dans le PDF — le scale 0.75x du
  // Chrome PDF renderer ne touche que header/footer, ici c'est dans le
  // body donc valeur réelle).
  const CHART_HEIGHT = 110;
  const targetTopPct = maxValue > 0 ? (1 - target / maxValue) * 100 : 100;

  return (
    <div
      style={{
        position: "relative",
        height: `${CHART_HEIGHT + 22}px`, // place pour les labels mois
        width: "100%",
        borderBottom: `1px solid ${THEME.hair}`,
      }}
    >
      {/* Ligne cible (pointillés) */}
      <div
        style={{
          position: "absolute",
          top: `${targetTopPct}%`,
          left: 0,
          right: 0,
          height: "0",
          borderTop: `1px dashed ${THEME.slate}`,
          opacity: 0.5,
        }}
      />
      {/* Barres */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${CHART_HEIGHT}px`,
          display: "flex",
          alignItems: "flex-end",
          gap: "4px",
          padding: "0 2px",
        }}
      >
        {months.map((m, idx) => {
          const heightPct = maxValue > 0 ? (m.hours / maxValue) * 100 : 0;
          const isOverPace = m.hours > target * 1.5;
          let barColor = THEME.slateLight;
          if (m.isCurrentReportMonth) {
            barColor =
              status === "overage" ? "#DC2626" :
              status === "warning" ? THEME.warning :
              THEME.blue;
          } else if (isOverPace && !m.isFuture) {
            barColor = THEME.warning;
          }
          return (
            <div
              key={idx}
              style={{
                flex: "1 1 0",
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {/* Valeur au-dessus de la barre */}
              {m.hours > 0 ? (
                <div
                  className="mrd-mono"
                  style={{
                    fontSize: "8.5px",
                    color: m.isCurrentReportMonth ? THEME.ink : THEME.slate,
                    fontWeight: m.isCurrentReportMonth ? 600 : 400,
                    fontVariantNumeric: "tabular-nums",
                    marginBottom: "2px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.hours}
                </div>
              ) : null}
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: m.hours > 0 ? "2px" : "0",
                  background: m.isFuture ? "transparent" : barColor,
                  border: m.isFuture ? `1px dashed ${THEME.hair}` : "none",
                  borderRadius: "1.5px 1.5px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels mois sous les barres */}
      <div
        style={{
          position: "absolute",
          top: `${CHART_HEIGHT + 4}px`,
          left: 0,
          right: 0,
          display: "flex",
          gap: "4px",
          padding: "0 2px",
        }}
      >
        {months.map((m, idx) => (
          <div
            key={idx}
            style={{
              flex: "1 1 0",
              textAlign: "center",
              fontSize: "9px",
              fontWeight: m.isCurrentReportMonth ? 600 : 400,
              color: m.isCurrentReportMonth ? THEME.ink : THEME.slate,
              textTransform: "lowercase",
            }}
          >
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecapSection({ recap }: { recap: NonNullable<MonthlyReportPayload["recap"]> }) {
  // byCoverage est volontairement non destructuré : non rendu dans le PDF
  // client (cf. note RecapSection plus bas).
  const { byTimeBucket, byActivity, byCategory, trips } = recap;

  return (
    <PageSection breakBefore>
      <SectionTitle eyebrow="Synthèse">Récapitulatif du mois</SectionTitle>

      {/* Bloc Couverture (forfait vs hors forfait) — INTENTIONNELLEMENT RETIRÉ
          du PDF client : exposer ce ratio met en évidence le volume hors
          forfait quand il existe, et risque de provoquer des questions
          défensives côté client. Les chiffres restent calculés côté builder
          (utilisés ailleurs : analytics interne, total payload), juste pas
          rendus dans le récap. */}

      {/* Bloc 2 — Plages horaires */}
      <RecapBlock title="Heures par plage horaire">
        <RecapMiniTable
          rows={[
            { label: "Jour ouvrable (standard)", hours: byTimeBucket.dayHours, share: byTimeBucket.dayShare },
            { label: "Soir (after-hours semaine)", hours: byTimeBucket.eveningHours, share: byTimeBucket.eveningShare },
            { label: "Fin de semaine", hours: byTimeBucket.weekendHours, share: byTimeBucket.weekendShare },
            { label: "Urgence", hours: byTimeBucket.urgentHours, share: byTimeBucket.urgentShare },
          ]}
        />
        <p
          style={{
            marginTop: "8px",
            fontSize: "10px",
            fontStyle: "italic",
            color: THEME.slate,
            lineHeight: 1.5,
          }}
        >
          Les heures urgentes ont préséance sur fin de semaine et soir ; une
          intervention urgente le samedi est comptabilisée dans « Urgence »
          uniquement.
        </p>
      </RecapBlock>

      {/* Bloc 3 — Types d'activité */}
      <RecapBlock title="Heures par type d'activité">
        {byActivity.length === 0 ? (
          <EmptyNote>Aucune heure facturable saisie sur la période.</EmptyNote>
        ) : (
          <RecapMiniTable
            rows={byActivity.map((a) => ({
              label: ACTIVITY_LABELS[a.timeType] ?? a.timeType,
              hours: a.hours,
              share: a.share,
            }))}
          />
        )}
      </RecapBlock>

      {/* Bloc 4 — Déplacements */}
      <RecapBlock title="Déplacements">
        <RecapMiniTable
          showShare={false}
          rows={[
            { label: "Total déplacements", hours: trips.total, unit: "" },
            ...(trips.ftigActive
              ? [
                  { label: "Inclus au quota FTIG", hours: trips.includedFtig, unit: "" },
                  { label: "Hors quota / facturables", hours: trips.billable, unit: "" },
                ]
              : []),
          ]}
        />
      </RecapBlock>

      {/* Bloc 5 — Catégories (graphique barres horizontales) */}
      <RecapBlock title="Heures par catégorie de ticket">
        {byCategory.length === 0 ? (
          <EmptyNote>Aucune activité catégorisée sur la période.</EmptyNote>
        ) : (
          <CategoryBarChart items={byCategory} />
        )}
      </RecapBlock>
    </PageSection>
  );
}

function RecapBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="break-inside-avoid"
      style={{
        marginBottom: "20px",
        paddingBottom: "16px",
        borderBottom: `1px solid ${THEME.hair}`,
      }}
    >
      <h3
        className="mrd-eyebrow"
        style={{
          fontSize: "10px",
          color: THEME.accent,
          margin: "0 0 10px 0",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

interface RecapRow {
  label: string;
  hours: number;
  share?: number;
  unit?: string;
}
function RecapMiniTable({ rows, showShare = true }: { rows: RecapRow[]; showShare?: boolean }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} style={{ borderBottom: idx < rows.length - 1 ? `1px solid ${THEME.hairLight}` : "none" }}>
            <td style={{ padding: "5px 10px 5px 0", color: THEME.ink }}>{r.label}</td>
            <td
              className="mrd-mono"
              style={{
                padding: "5px 10px 5px 0",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: THEME.ink,
                fontWeight: 500,
                width: "90px",
              }}
            >
              {r.unit === "" ? r.hours.toLocaleString("fr-CA") : fmtHours(r.hours)}
            </td>
            {showShare ? (
              <td
                className="mrd-mono"
                style={{
                  padding: "5px 0",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: THEME.slate,
                  width: "60px",
                }}
              >
                {fmtPct(r.share ?? 0)}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategoryBarChart({
  items,
}: {
  items: NonNullable<MonthlyReportPayload["recap"]>["byCategory"];
}) {
  const maxHours = Math.max(...items.map((i) => i.hours), 0);
  if (maxHours <= 0) {
    return <EmptyNote>Aucune activité catégorisée sur la période.</EmptyNote>;
  }
  // Top 8 + ligne « Autres » si plus long, en gardant « Non classé » à la fin
  // de toute façon (déjà trié ainsi par le builder).
  const named = items.filter((i) => i.categoryId !== null);
  const uncat = items.find((i) => i.categoryId === null);
  const TOP = 8;
  const visibleNamed = named.slice(0, TOP);
  const overflow = named.slice(TOP);
  const overflowAgg = overflow.length > 0
    ? {
        categoryId: "__other__" as const,
        name: `Autres (${overflow.length})`,
        hours: overflow.reduce((s, x) => s + x.hours, 0),
        share: overflow.reduce((s, x) => s + x.share, 0),
      }
    : null;

  const rows = [
    ...visibleNamed,
    ...(overflowAgg ? [overflowAgg] : []),
    ...(uncat ? [uncat] : []),
  ];

  return (
    <div>
      {rows.map((row, idx) => {
        const isUncat = row.categoryId === null;
        const isOverflow = row.categoryId === "__other__";
        const widthPct = maxHours > 0 ? (row.hours / maxHours) * 100 : 0;
        return (
          <div
            key={idx}
            className="break-inside-avoid"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "5px 0",
              borderBottom: idx < rows.length - 1 ? `1px solid ${THEME.hairLight}` : "none",
              fontSize: "11.5px",
            }}
          >
            <div
              style={{
                width: "32%",
                color: isUncat ? THEME.slate : THEME.ink,
                fontStyle: isUncat ? "italic" : "normal",
                fontWeight: isUncat || isOverflow ? 400 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={row.name}
            >
              {row.name}
            </div>
            <div
              style={{
                flex: 1,
                position: "relative",
                height: "10px",
                background: THEME.hairLight,
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: isUncat ? THEME.slateLight : isOverflow ? THEME.slate : THEME.blue,
                }}
              />
            </div>
            <div
              className="mrd-mono"
              style={{
                width: "70px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: THEME.ink,
                fontWeight: 500,
              }}
            >
              {fmtHours(row.hours)}
            </div>
            <div
              className="mrd-mono"
              style={{
                width: "50px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: THEME.slate,
              }}
            >
              {fmtPct(row.share)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// SHARED — empty state stylisé
// ===========================================================================
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "24px",
        textAlign: "center",
        color: THEME.slate,
        fontStyle: "italic",
        fontSize: "12px",
        background: THEME.blueIce,
        border: `1px dashed ${THEME.bluePale}`,
      }}
    >
      {children}
    </div>
  );
}
