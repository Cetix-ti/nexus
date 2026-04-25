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
  return `${hours.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} h`;
}
function fmtMinutesAsHours(minutes: number): string {
  return fmtHours(Math.round((minutes / 60) * 10) / 10);
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
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Génère un court paragraphe synthèse pour la lettre exécutive — calculé
// depuis les totaux. Pas d'IA, juste de la composition textuelle.
// ---------------------------------------------------------------------------
function executiveSummaryText(payload: MonthlyReportPayload): string {
  const t = payload.totals;
  const billableShare = t.totalHours > 0
    ? Math.round((t.billableHours / t.totalHours) * 100)
    : 0;
  const tripsLine = payload.trips.count > 0
    ? `${payload.trips.count} déplacement${payload.trips.count > 1 ? "s" : ""}`
    : "aucun déplacement";
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
}: {
  payload: MonthlyReportPayload;
  logoSrc: string;
}) {
  const { organization, period, totals, byAgent, byRequester, trips, tickets } = payload;
  const summary = executiveSummaryText(payload);

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
        @page { size: Letter; margin: 0; }
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
        <ExecutiveSummary payload={payload} />
        <AgentBreakdownSection byAgent={byAgent} totals={totals} />
        {byRequester.length > 0 && <RequesterSection byRequester={byRequester} />}
        <TripsSection trips={trips} />
        <TicketsSection tickets={tickets} />
        <FinancialSummary totals={totals} trips={trips} />
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
        padding: "60px 60px 40px",
        minHeight: "100vh",
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
      style={{ padding: "56px 60px" }}
    >
      {children}
    </section>
  );
}

// ===========================================================================
// EXECUTIVE SUMMARY — KPIs avec hiérarchie : un héros + secondaires
// ===========================================================================
function ExecutiveSummary({ payload }: { payload: MonthlyReportPayload }) {
  const { totals, trips } = payload;
  const billableShare = totals.totalHours > 0 ? Math.round((totals.billableHours / totals.totalHours) * 100) : 0;
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="01 — En un coup d'œil">Sommaire exécutif</SectionTitle>

      {/* Hero KPI : montant total */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "32px",
          alignItems: "stretch",
          marginBottom: "32px",
        }}
      >
        <HeroKpi
          label="Total du mois"
          value={fmtMoneyShort(totals.totalAmount)}
          sub={`${fmtMoney(totals.hoursAmount)} heures + ${fmtMoney(totals.tripsAmount)} déplacements`}
        />
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
}: {
  byAgent: MonthlyReportPayload["byAgent"];
  totals: MonthlyReportPayload["totals"];
}) {
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
            { key: "rate", label: "Taux moy.", align: "right", muted: true },
            { key: "billed", label: "Facturé", align: "right", emphasis: true },
          ]}
          rows={byAgent.map((a) => ({
            id: a.agent.id,
            name: a.agent.fullName,
            hours: fmtHours(a.hours),
            share: `${(a.share * 100).toLocaleString("fr-CA", { maximumFractionDigits: 0 })}%`,
            billable: fmtHours(a.billableHours),
            rate: a.averageRate != null ? fmtMoney(a.averageRate) : "—",
            billed: fmtMoney(a.billedAmount),
          }))}
          totalRow={{
            name: "Total",
            hours: fmtHours(totals.totalHours),
            share: "—",
            billable: fmtHours(totals.billableHours),
            rate: "—",
            billed: fmtMoney(totals.hoursAmount),
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
          { key: "name", label: "Demandeur", width: "32%" },
          { key: "title", label: "Fonction", width: "30%", muted: true },
          { key: "opened", label: "Créés", align: "right" },
          { key: "resolved", label: "Résolus", align: "right" },
          { key: "time", label: "Temps total", align: "right", emphasis: true },
        ]}
        rows={byRequester.map((r) => ({
          id: r.requester.id,
          name: r.requester.fullName,
          title: r.requester.jobTitle ?? "—",
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
function TripsSection({ trips }: { trips: MonthlyReportPayload["trips"] }) {
  return (
    <PageSection breakAfter>
      <SectionTitle eyebrow="04 — Mobilité">Déplacements</SectionTitle>

      {!trips.billable && trips.nonBillableReason ? (
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
            ...(trips.billable
              ? [{ key: "billed", label: "Facturé", align: "right" as const, emphasis: true }]
              : []),
          ]}
          rows={trips.lines.map((t, i) => ({
            id: `t${i}`,
            date: fmtDateShort(t.date),
            agent: t.agentName,
            ticket: t.ticketDisplayId ?? "—",
            subject: t.ticketSubject ?? "—",
            ...(trips.billable
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
function TicketsSection({ tickets }: { tickets: MonthlyReportTicketBlock[] }) {
  return (
    <PageSection>
      <SectionTitle eyebrow="05 — Détail des interventions">Tickets traités</SectionTitle>
      {tickets.length === 0 ? (
        <EmptyNote>Aucun ticket à afficher.</EmptyNote>
      ) : (
        <div style={{ display: "grid", gap: "20px" }}>
          {tickets.map((t) => <TicketBlock key={t.ticketId} ticket={t} />)}
        </div>
      )}
    </PageSection>
  );
}

function TicketBlock({ ticket }: { ticket: MonthlyReportTicketBlock }) {
  return (
    <article
      className="break-inside-avoid"
      style={{
        border: `1px solid ${THEME.hair}`,
        borderTop: `2px solid ${THEME.blue}`,
        padding: "20px 24px",
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

      <div
        style={{
          marginTop: "12px",
          display: "flex",
          flexWrap: "wrap",
          gap: "20px",
          fontSize: "11px",
          color: THEME.slate,
        }}
      >
        {ticket.requesterName ? (
          <Meta2 label="Demandeur" value={ticket.requesterName} />
        ) : null}
        <Meta2 label="Temps total" value={fmtMinutesAsHours(ticket.totalMinutes)} mono />
        {ticket.totalAmount > 0 ? <Meta2 label="Facturé" value={fmtMoney(ticket.totalAmount)} mono /> : null}
        {ticket.resolvedAt ? <Meta2 label="Résolu le" value={fmtDateShort(ticket.resolvedAt.slice(0, 10))} /> : null}
      </div>

      {ticket.agents.length > 0 ? (
        <div style={{ marginTop: "8px", fontSize: "11px", color: THEME.slate }}>
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
            marginTop: "16px",
            background: "#ECFDF5",
            borderLeft: `3px solid ${THEME.positive}`,
            padding: "12px 16px",
          }}
        >
          <div className="mrd-eyebrow" style={{ color: THEME.positive, marginBottom: "6px" }}>
            Note de résolution
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: THEME.inkSoft,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {ticket.resolutionNote}
          </p>
        </div>
      ) : null}

      {ticket.timeEntries.length > 0 ? (
        <div style={{ marginTop: "16px" }}>
          <div className="mrd-eyebrow" style={{ color: THEME.slate, marginBottom: "8px" }}>
            Interventions
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <tbody>
              {ticket.timeEntries.map((e) => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${THEME.hair}`, verticalAlign: "top" }}>
                  <td className="mrd-mono" style={{ padding: "6px 12px 6px 0", color: THEME.slate, whiteSpace: "nowrap", width: "60px" }}>
                    {fmtDateShort(e.date)}
                  </td>
                  <td style={{ padding: "6px 12px 6px 0", color: THEME.inkSoft, whiteSpace: "nowrap", width: "120px" }}>
                    {e.agentName}
                  </td>
                  <td className="mrd-mono" style={{ padding: "6px 12px 6px 0", textAlign: "right", whiteSpace: "nowrap", width: "55px", color: THEME.ink }}>
                    {fmtMinutesAsHours(e.durationMinutes)}
                  </td>
                  <td className="mrd-eyebrow" style={{ padding: "6px 12px 6px 0", color: THEME.slate, whiteSpace: "nowrap", width: "80px" }}>
                    {coverageLabel(e.coverageStatus)}
                  </td>
                  <td style={{ padding: "6px 0", color: THEME.inkSoft }}>
                    {e.description || <span style={{ fontStyle: "italic", color: THEME.slate }}>Aucune note</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
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
                padding: "10px 12px 10px 0",
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
                  padding: "12px 12px 12px 0",
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
                  padding: "14px 12px 14px 0",
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
