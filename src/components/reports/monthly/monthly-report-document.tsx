// ============================================================================
// MonthlyReportDocument — composant de rendu du rapport mensuel client.
//
// Server component pur : reçoit le payload et rend le HTML statique.
// Utilisé par la page /internal/reports/monthly/[id] (Puppeteer) et peut
// aussi être affiché dans l'app pour aperçu.
//
// Styling : Tailwind + print-specific (break-inside, color-adjust).
// ============================================================================

import type { MonthlyReportPayload } from "@/lib/reports/monthly/types";

function fmtHours(hours: number): string {
  return `${hours.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} h`;
}

function fmtMinutesAsHours(minutes: number): string {
  return fmtHours(Math.round((minutes / 60) * 10) / 10);
}

function fmtMoney(amount: number): string {
  return amount.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
  });
}

function fmtDateFR(iso: string): string {
  // "2026-04-12" → "12 avril 2026"
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function coverageLabel(status: string): string {
  switch (status) {
    case "billable":
      return "Facturable";
    case "included_in_contract":
      return "Inclus au contrat";
    case "deducted_from_hour_bank":
      return "Banque d'heures";
    case "msp_monthly":
      return "Forfait MSP";
    case "non_billable":
      return "Non facturable";
    case "pending":
      return "En attente";
    default:
      return status;
  }
}

export function MonthlyReportDocument({
  payload,
  logoSrc,
}: {
  payload: MonthlyReportPayload;
  logoSrc: string;
}) {
  const { organization, period, totals, byAgent, byRequester, trips, tickets } =
    payload;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* ================== Couverture ================== */}
      <section className="px-12 pt-16 pb-8 break-after-page">
        <div className="flex items-center justify-between border-b-2 border-blue-700 pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="Cetix" className="h-14" />
          <div className="text-right text-xs text-slate-500 uppercase tracking-wider">
            Rapport mensuel de service
          </div>
        </div>
        <div className="mt-24 space-y-4">
          <div className="text-sm text-slate-500 uppercase tracking-widest">
            Rapport mensuel
          </div>
          <h1 className="text-5xl font-bold text-slate-900 leading-tight">
            {period.label.charAt(0).toUpperCase() + period.label.slice(1)}
          </h1>
          <div className="text-3xl font-semibold text-blue-700 mt-6">
            {organization.name}
          </div>
          {organization.clientCode ? (
            <div className="text-sm text-slate-500">
              Code client&nbsp;: {organization.clientCode}
            </div>
          ) : null}
        </div>

        <div className="mt-32 grid grid-cols-2 gap-x-8 gap-y-3 text-sm border-t border-slate-200 pt-6">
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">
              Période couverte
            </div>
            <div className="mt-1 text-slate-700">
              Du {fmtDateFR(period.startDate)} au {fmtDateFR(period.endDate)}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">
              Généré le
            </div>
            <div className="mt-1 text-slate-700">
              {fmtDateFR(payload.generatedAt.slice(0, 10))}
            </div>
          </div>
          {payload.activeContracts.length > 0 ? (
            <div className="col-span-2">
              <div className="text-slate-400 text-xs uppercase tracking-wider">
                Contrats actifs
              </div>
              <div className="mt-1 text-slate-700">
                {payload.activeContracts.map((c) => c.name).join(" · ")}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ================== Sommaire exécutif ================== */}
      <section className="px-12 py-10 break-after-page">
        <SectionTitle>Sommaire exécutif</SectionTitle>
        <div className="grid grid-cols-4 gap-4 mt-6">
          <KpiCard
            label="Heures totales"
            value={fmtHours(totals.totalHours)}
            sub={`${fmtHours(totals.billableHours)} facturables`}
          />
          <KpiCard
            label="Heures couvertes"
            value={fmtHours(totals.coveredHours)}
            sub="Forfait / banque d'heures"
          />
          <KpiCard
            label="Déplacements"
            value={`${trips.count}`}
            sub={
              trips.billable
                ? "Facturés au taux horaire"
                : (trips.nonBillableReason ?? "Non facturés")
            }
          />
          <KpiCard
            label="Total du mois"
            value={fmtMoney(totals.totalAmount)}
            sub={`${fmtMoney(totals.hoursAmount)} heures`}
            highlight
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <KpiCard
            label="Tickets créés"
            value={`${totals.ticketsOpenedCount}`}
          />
          <KpiCard
            label="Tickets résolus"
            value={`${totals.ticketsResolvedCount}`}
          />
          <KpiCard
            label="Tickets avec activité"
            value={`${totals.ticketsTouchedCount}`}
          />
        </div>
      </section>

      {/* ================== Répartition par agent ================== */}
      <section className="px-12 py-10 break-after-page">
        <SectionTitle>Répartition des heures par technicien</SectionTitle>
        {byAgent.length === 0 ? (
          <EmptyNote>Aucune heure saisie pour ce mois.</EmptyNote>
        ) : (
          <table className="w-full text-sm mt-6 border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Technicien</th>
                <th className="py-2 pr-3 text-right">Heures</th>
                <th className="py-2 pr-3 text-right">% du mois</th>
                <th className="py-2 pr-3 text-right">Facturables</th>
                <th className="py-2 pr-3 text-right">Taux moyen</th>
                <th className="py-2 text-right">Facturé</th>
              </tr>
            </thead>
            <tbody>
              {byAgent.map((a) => (
                <tr
                  key={a.agent.id}
                  className="border-b border-slate-100 break-inside-avoid"
                >
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {a.agent.fullName}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmtHours(a.hours)}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-500 tabular-nums">
                    {(a.share * 100).toLocaleString("fr-CA", {
                      maximumFractionDigits: 0,
                    })}
                    %
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmtHours(a.billableHours)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {a.averageRate != null ? fmtMoney(a.averageRate) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {fmtMoney(a.billedAmount)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold bg-slate-50">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {fmtHours(totals.totalHours)}
                </td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right tabular-nums">
                  {fmtHours(totals.billableHours)}
                </td>
                <td className="py-2 pr-3" />
                <td className="py-2 text-right tabular-nums">
                  {fmtMoney(totals.hoursAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* ================== Tickets par demandeur ================== */}
      <section className="px-12 py-10 break-after-page">
        <SectionTitle>Tickets par demandeur</SectionTitle>
        {byRequester.length === 0 ? (
          <EmptyNote>Aucun ticket avec demandeur identifié ce mois.</EmptyNote>
        ) : (
          <table className="w-full text-sm mt-6 border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Demandeur</th>
                <th className="py-2 pr-3">Fonction</th>
                <th className="py-2 pr-3 text-right">Tickets créés</th>
                <th className="py-2 pr-3 text-right">Tickets résolus</th>
                <th className="py-2 text-right">Temps total</th>
              </tr>
            </thead>
            <tbody>
              {byRequester.map((r) => (
                <tr
                  key={r.requester.id}
                  className="border-b border-slate-100 break-inside-avoid"
                >
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {r.requester.fullName}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {r.requester.jobTitle ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.ticketsOpenedThisMonth}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.ticketsResolvedThisMonth}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtMinutesAsHours(r.totalMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ================== Déplacements ================== */}
      <section className="px-12 py-10 break-after-page">
        <SectionTitle>Déplacements</SectionTitle>
        {!trips.billable && trips.nonBillableReason ? (
          <div className="mt-4 text-sm bg-blue-50 border-l-4 border-blue-400 px-4 py-3 text-slate-700">
            {trips.nonBillableReason}
          </div>
        ) : null}
        {trips.count === 0 ? (
          <EmptyNote>Aucun déplacement enregistré ce mois.</EmptyNote>
        ) : (
          <table className="w-full text-sm mt-6 border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Technicien</th>
                <th className="py-2 pr-3">Ticket</th>
                <th className="py-2 pr-3">Sujet</th>
                {trips.billable ? (
                  <th className="py-2 text-right">Facturé</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {trips.lines.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 break-inside-avoid"
                >
                  <td className="py-2 pr-3 tabular-nums">
                    {fmtDateShort(t.date)}
                  </td>
                  <td className="py-2 pr-3">{t.agentName}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-blue-700">
                    {t.ticketDisplayId ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {t.ticketSubject ?? "—"}
                  </td>
                  {trips.billable ? (
                    <td className="py-2 text-right tabular-nums">
                      {t.billedAmount != null ? fmtMoney(t.billedAmount) : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ================== Détail des tickets ================== */}
      <section className="px-12 py-10">
        <SectionTitle>Détail des tickets</SectionTitle>
        {tickets.length === 0 ? (
          <EmptyNote>Aucun ticket à afficher.</EmptyNote>
        ) : (
          <div className="mt-6 space-y-6">
            {tickets.map((t) => (
              <TicketBlock key={t.ticketId} ticket={t} />
            ))}
          </div>
        )}
      </section>

      {/* ================== Récapitulatif financier ================== */}
      <section className="px-12 py-10 break-before-page">
        <SectionTitle>Récapitulatif financier</SectionTitle>
        <div className="mt-6 max-w-md ml-auto">
          <FinancialRow label="Heures facturées" value={fmtMoney(totals.hoursAmount)} />
          {trips.billable ? (
            <FinancialRow
              label={`Déplacements (${trips.count})`}
              value={fmtMoney(totals.tripsAmount)}
            />
          ) : (
            <FinancialRow
              label={`Déplacements (${trips.count})`}
              value="Inclus"
              muted
            />
          )}
          <div className="mt-3 pt-3 border-t-2 border-slate-900 flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{fmtMoney(totals.totalAmount)}</span>
          </div>
          <div className="text-xs text-slate-500 mt-4 italic">
            Montants indicatifs — document généré automatiquement. À confirmer
            avec la facture officielle.
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- Sub-components ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-slate-900 border-b-2 border-blue-700 pb-2">
      {children}
    </h2>
  );
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg p-4 border " +
        (highlight
          ? "bg-blue-600 text-white border-blue-700"
          : "bg-slate-50 border-slate-200 text-slate-900")
      }
    >
      <div
        className={
          "text-xs uppercase tracking-wider " +
          (highlight ? "text-blue-100" : "text-slate-500")
        }
      >
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub ? (
        <div
          className={
            "text-xs mt-1 " + (highlight ? "text-blue-100" : "text-slate-500")
          }
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 text-sm text-slate-500 italic">{children}</div>
  );
}

function FinancialRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "flex justify-between py-2 text-sm " +
        (muted ? "text-slate-500" : "text-slate-900")
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TicketBlock({
  ticket,
}: {
  ticket: import("@/lib/reports/monthly/types").MonthlyReportTicketBlock;
}) {
  return (
    <article className="border border-slate-200 rounded-lg p-5 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 flex-1 min-w-0">
          <span className="font-mono text-sm font-bold text-blue-700 whitespace-nowrap">
            {ticket.displayId}
          </span>
          <h3 className="font-semibold text-slate-900 truncate">
            {ticket.subject}
          </h3>
        </div>
        <span className="text-xs uppercase tracking-wider text-slate-500 whitespace-nowrap">
          {ticket.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        {ticket.requesterName ? (
          <span>
            Demandeur&nbsp;: <span className="text-slate-900">{ticket.requesterName}</span>
          </span>
        ) : null}
        <span>
          Temps total&nbsp;:{" "}
          <span className="text-slate-900 font-medium tabular-nums">
            {fmtMinutesAsHours(ticket.totalMinutes)}
          </span>
        </span>
        {ticket.totalAmount > 0 ? (
          <span>
            Facturé&nbsp;:{" "}
            <span className="text-slate-900 font-medium tabular-nums">
              {fmtMoney(ticket.totalAmount)}
            </span>
          </span>
        ) : null}
        {ticket.resolvedAt ? (
          <span>
            Résolu le&nbsp;:{" "}
            <span className="text-slate-900">
              {fmtDateShort(ticket.resolvedAt.slice(0, 10))}
            </span>
          </span>
        ) : null}
      </div>

      {ticket.agents.length > 0 ? (
        <div className="mt-2 text-xs text-slate-600">
          Techniciens&nbsp;:{" "}
          {ticket.agents.map((a, i) => (
            <span key={a.name}>
              {i > 0 ? ", " : ""}
              <span className="text-slate-900">{a.name}</span>
              <span className="text-slate-500">
                {" "}
                ({fmtMinutesAsHours(a.minutes)})
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {ticket.resolutionNote ? (
        <div className="mt-3 text-sm bg-emerald-50 border-l-4 border-emerald-400 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-1">
            Note de résolution
          </div>
          <p className="whitespace-pre-wrap text-slate-800">
            {ticket.resolutionNote}
          </p>
        </div>
      ) : null}

      {ticket.timeEntries.length > 0 ? (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Interventions
          </div>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {ticket.timeEntries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-3 text-slate-500 tabular-nums whitespace-nowrap w-20">
                    {fmtDateShort(e.date)}
                  </td>
                  <td className="py-1 pr-3 text-slate-700 whitespace-nowrap w-32 truncate">
                    {e.agentName}
                  </td>
                  <td className="py-1 pr-3 tabular-nums whitespace-nowrap w-14 text-right text-slate-600">
                    {fmtMinutesAsHours(e.durationMinutes)}
                  </td>
                  <td className="py-1 pr-3 text-slate-500 text-[10px] uppercase tracking-wider whitespace-nowrap w-24">
                    {coverageLabel(e.coverageStatus)}
                  </td>
                  <td className="py-1 text-slate-700">
                    {e.description || (
                      <span className="italic text-slate-400">
                        Aucune note
                      </span>
                    )}
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
