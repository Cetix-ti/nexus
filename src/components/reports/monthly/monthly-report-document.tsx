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
// Génère un court paragraphe synthèse pour la lettre exécutive — calculé
// depuis les totaux. Pas d'IA, juste de la composition textuelle.
// ---------------------------------------------------------------------------
function executiveSummaryText(
  payload: MonthlyReportPayload,
  opts: { hideRates?: boolean } = {},
): string {
  const t = payload.totals;
  const tripsLine = payload.trips.count > 0
    ? `${payload.trips.count} déplacement${payload.trips.count > 1 ? "s" : ""}`
    : "aucun déplacement";
  // En variante "heures seulement", on ne mentionne pas la part facturable
  // (calcul tiré du rapport $) — on reste sur le décompte d'heures pur.
  if (opts.hideRates) {
    return `Au cours de ${payload.period.label}, l'équipe Cetix a livré `
      + `${fmtHours(t.totalHours)} de service à ${payload.organization.name}. `
      + `${t.ticketsResolvedCount} ticket${t.ticketsResolvedCount > 1 ? "s ont été résolus" : " a été résolu"} `
      + `sur ${t.ticketsTouchedCount} pris en charge, et ${tripsLine} `
      + `${payload.trips.count > 0 ? "a été" : "n'a été"} consigné${payload.trips.count !== 1 ? "s" : ""} sur la période.`;
  }
  const billableShare = t.totalHours > 0
    ? Math.round((t.billableHours / t.totalHours) * 100)
    : 0;
  return `Au cours de ${payload.period.label}, l'équipe Cetix a livré `
    + `${fmtHours(t.totalHours)} de service à ${payload.organization.name}, dont `
    + `${fmtHours(t.billableHours)} facturables (${billableShare}%) et `
    + `${fmtHours(t.coveredHours)} incluses au contrat. `
    + `${t.ticketsResolvedCount} ticket${t.ticketsResolvedCount > 1 ? "s ont été résolus" : " a été résolu"} `
    + `sur ${t.ticketsTouchedCount} pris en charge, et ${tripsLine} `
    + `${payload.trips.count > 0 ? "a été" : "n'a été"} consigné${payload.trips.count !== 1 ? "s" : ""} sur la période.`;
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
        /* IMPORTANT : on laisse Puppeteer (page.pdf({ margin: ... }))
           contrôler les marges. Pas de @page margin override ici, sinon
           la footer template overlaperait le contenu. */
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
            { key: "ticket", label: "Ticket", width: "16%", mono: true },
            { key: "subject", label: "Sujet", muted: true },
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
          {ticket.status}
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
