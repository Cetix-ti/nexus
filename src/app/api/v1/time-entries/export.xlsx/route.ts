// ============================================================================
// /api/v1/time-entries/export.xlsx
//
// Export Excel premium des saisies de temps (« Bons de travail »).
// Accepte les mêmes filtres que GET /api/v1/time-entries
// (organizationId, agentId, from, to) et retourne un .xlsx avec :
//   - Feuille 1 « Bons de travail » : liste détaillée, header gelé,
//     formats Excel natifs (date, devise, heures), couleurs par couverture.
//   - Feuille 2 « Synthèse » : pivots — par technicien, par couverture,
//     par organisation (si non filtré).
//
// Génération via exceljs (pure Node, pas de Python). Streamée en
// réponse pour ne pas charger un buffer complet en mémoire si volume.
// ============================================================================
//
// Cohérence : le filtre approvalStatus=rejected est exclu globalement
// par /api/v1/time-entries depuis cb39606. On reste alignés en lisant
// via listTimeEntries (mêmes règles).

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  listTimeEntries,
  type TimeEntryRow,
} from "@/lib/billing/time-entries-service";
import { getCurrentUser, hasCapability, hasMinimumRole } from "@/lib/auth-utils";
import { TIME_TYPE_LABELS, type TimeType } from "@/lib/billing/types";

const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable",
  non_billable: "Non facturable",
  included_in_contract: "Inclus contrat",
  deducted_from_hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque",
  excluded_from_billing: "Exclu",
  internal_time: "Interne",
  travel_billable: "Déplacement facturable",
  travel_non_billable: "Déplacement non facturable",
  msp_overage: "Dépassement forfait",
  pending: "En attente",
};

// Couleurs ARGB (8 chars : alpha + RGB) pour ExcelJS.
// Palette warm pour rester cohérent avec le rapport mensuel et l'esthétique
// éditoriale Cetix.
const COLOR = {
  headerBg:        "FF1E40AF", // bleu profond Cetix
  headerFg:        "FFFAFAF6",
  ink:             "FF0F172A",
  hair:            "FFE5E5E0",
  paper:           "FFFAFAF6",
  cream:           "FFF5EFDF",
  rowAlt:          "FFFCFAF5",
  // Tints par couverture (très pâles, ne doivent pas tuer la lisibilité)
  billableTint:    "FFE8F5EC",
  nonBillableTint: "FFFCE8E8",
  internalTint:    "FFEEEDE6",
  travelTint:      "FFE8F1F6",
  totalRowBg:      "FFF5EFDF",
};

function fmtTimeTypeLabel(t: string): string {
  return TIME_TYPE_LABELS[t as TimeType] ?? t;
}

function tintForCoverage(status: string): string | null {
  switch (status) {
    case "billable":
    case "included_in_contract":
    case "deducted_from_hour_bank":
      return COLOR.billableTint;
    case "non_billable":
    case "travel_non_billable":
    case "excluded_from_billing":
      return COLOR.nonBillableTint;
    case "internal_time":
      return COLOR.internalTint;
    case "travel_billable":
      return COLOR.travelTint;
    default:
      return null;
  }
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ticketId = url.searchParams.get("ticketId") || undefined;
  const organizationId = url.searchParams.get("organizationId") || undefined;
  const agentId = url.searchParams.get("agentId") || undefined;
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const rows = await listTimeEntries({
    ticketId,
    organizationId,
    agentId,
    from: fromStr ? new Date(fromStr) : undefined,
    to: toStr ? new Date(toStr) : undefined,
  });

  // Confidentialité tarifaire : redact $ pour les rôles sans cap finances
  // (même règle que GET).
  const showMoney = hasCapability(me, "finances");
  const sanitized = showMoney
    ? rows
    : rows.map((r) => ({ ...r, hourlyRate: null, amount: null }));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexus / Cetix";
  wb.created = new Date();
  wb.properties.date1904 = false;

  // ---------- Feuille 1 : Bons de travail ----------
  buildEntriesSheet(wb, sanitized, { showMoney });

  // ---------- Feuille 2 : Synthèse ----------
  buildSummarySheet(wb, sanitized, { showMoney, scoped: !!organizationId });

  // ---------- Stream ----------
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `bons-de-travail-${stamp}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ===========================================================================
// SHEET 1 — Liste détaillée avec format Excel natif
// ===========================================================================
function buildEntriesSheet(
  wb: ExcelJS.Workbook,
  rows: TimeEntryRow[],
  opts: { showMoney: boolean },
) {
  const sheet = wb.addWorksheet("Bons de travail", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  // Définition des colonnes — l'ordre détermine la lecture A → … →
  const baseCols: Array<Partial<ExcelJS.Column> & { key: string; header: string; width: number }> = [
    { key: "date",         header: "Date",            width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { key: "ticket",       header: "Ticket",          width: 9, style: { font: { name: "JetBrains Mono", size: 10 }, alignment: { horizontal: "left" } } },
    { key: "ticketSubject",header: "Sujet du ticket", width: 36 },
    { key: "agent",        header: "Technicien",      width: 22 },
    { key: "timeType",     header: "Type de travail", width: 18 },
    { key: "duration",     header: "Durée (h)",       width: 11, style: { numFmt: "0.00", alignment: { horizontal: "right" } } },
    { key: "description",  header: "Description",     width: 60 },
    { key: "coverage",     header: "Couverture",      width: 22 },
    { key: "onsite",       header: "Sur place",       width: 11, style: { alignment: { horizontal: "center" } } },
    { key: "travelBilled", header: "Déplac. fact.",   width: 13, style: { alignment: { horizontal: "center" } } },
    { key: "travelMin",    header: "Trajet (min)",    width: 12, style: { numFmt: "0", alignment: { horizontal: "right" } } },
  ];
  if (opts.showMoney) {
    baseCols.push(
      { key: "rate",   header: "Taux ($/h)", width: 12, style: { numFmt: "$#,##0.00;[Red]-$#,##0.00", alignment: { horizontal: "right" } } },
      { key: "amount", header: "Montant ($)", width: 14, style: { numFmt: "$#,##0.00;[Red]-$#,##0.00", alignment: { horizontal: "right" } } },
    );
  }
  sheet.columns = baseCols;

  // Style header
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: COLOR.headerFg }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 24;
  header.eachCell((cell) => {
    cell.border = { bottom: { style: "medium", color: { argb: COLOR.ink } } };
  });

  // Lignes de données
  rows.forEach((r, i) => {
    const row = sheet.addRow({
      date: new Date(r.startedAt),
      ticket: `#${r.ticketNumber || ""}`,
      ticketSubject: r.ticketSubject,
      agent: r.agentName,
      timeType: fmtTimeTypeLabel(r.timeType),
      duration: Math.round((r.durationMinutes / 60) * 100) / 100,
      description: r.description,
      coverage: COVERAGE_LABELS[r.coverageStatus] ?? r.coverageStatus,
      onsite: r.isOnsite ? "✓" : "",
      travelBilled: r.hasTravelBilled ? "✓" : "",
      travelMin: r.travelDurationMinutes ?? "",
      rate: opts.showMoney ? r.hourlyRate : "",
      amount: opts.showMoney ? r.amount : "",
    });
    // Tint par couverture (alterne avec rowAlt pour respiration visuelle)
    const tint = tintForCoverage(r.coverageStatus);
    if (tint) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint } };
      });
    } else if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.rowAlt } };
      });
    }
    // Wrap description (jusqu'à 4 lignes ≈ 64px, capacité du row hauteur auto)
    row.getCell("description").alignment = { wrapText: true, vertical: "top" };
    row.getCell("ticketSubject").alignment = { wrapText: true, vertical: "top" };
    row.getCell("ticket").font = { name: "JetBrains Mono", size: 10, color: { argb: "FF1E40AF" }, bold: true };
    row.alignment = { vertical: "top" };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: COLOR.hair } } };
    });
  });

  // Totaux : ligne sommée si données
  if (rows.length > 0) {
    const lastDataRow = rows.length + 1;
    const totalRow = sheet.addRow({
      date: "",
      ticket: "",
      ticketSubject: "",
      agent: "",
      timeType: "TOTAL",
      duration: { formula: `SUM(F2:F${lastDataRow})` },
      description: `${rows.length} entrée${rows.length > 1 ? "s" : ""}`,
      coverage: "",
      onsite: "",
      travelBilled: "",
      travelMin: { formula: `SUM(K2:K${lastDataRow})` },
      ...(opts.showMoney
        ? {
            rate: "",
            amount: { formula: `SUM(M2:M${lastDataRow})` },
          }
        : {}),
    });
    totalRow.font = { bold: true, color: { argb: COLOR.ink } };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalRowBg } };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: "medium", color: { argb: COLOR.ink } } };
    });
  }

  // Auto-filter sur le header (filtres natifs Excel)
  const lastCol = String.fromCharCode(64 + baseCols.length); // A=65 → A...K|M
  sheet.autoFilter = `A1:${lastCol}1`;
}

// ===========================================================================
// SHEET 2 — Synthèses pivot
// ===========================================================================
function buildSummarySheet(
  wb: ExcelJS.Workbook,
  rows: TimeEntryRow[],
  opts: { showMoney: boolean; scoped: boolean },
) {
  const sheet = wb.addWorksheet("Synthèse", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  let currentRow = 1;

  // Titre + meta
  const title = sheet.getCell(`A${currentRow}`);
  title.value = "Synthèse des bons de travail";
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: COLOR.ink } };
  sheet.mergeCells(`A${currentRow}:F${currentRow}`);
  sheet.getRow(currentRow).height = 26;
  currentRow += 1;

  const meta = sheet.getCell(`A${currentRow}`);
  meta.value = `${rows.length} entrée${rows.length > 1 ? "s" : ""} · Généré le ${new Date().toLocaleDateString("fr-CA")}${opts.scoped ? " · Scope : 1 organisation" : ""}`;
  meta.font = { color: { argb: "FF78716C" }, italic: true, size: 10 };
  sheet.mergeCells(`A${currentRow}:F${currentRow}`);
  currentRow += 2;

  // Pivot 1 — par technicien
  currentRow = addPivotBlock({
    sheet,
    startRow: currentRow,
    title: "Heures par technicien",
    headers: opts.showMoney
      ? ["Technicien", "Entrées", "Heures", "Montant"]
      : ["Technicien", "Entrées", "Heures"],
    rows: aggregateBy(rows, (r) => r.agentName).map((g) => {
      const base: (string | number)[] = [g.key, g.count, g.hours];
      if (opts.showMoney) base.push(g.amount);
      return base;
    }),
    showMoney: opts.showMoney,
  });
  currentRow += 1;

  // Pivot 2 — par couverture
  currentRow = addPivotBlock({
    sheet,
    startRow: currentRow,
    title: "Heures par couverture",
    headers: opts.showMoney
      ? ["Couverture", "Entrées", "Heures", "Montant"]
      : ["Couverture", "Entrées", "Heures"],
    rows: aggregateBy(rows, (r) => COVERAGE_LABELS[r.coverageStatus] ?? r.coverageStatus).map((g) => {
      const base: (string | number)[] = [g.key, g.count, g.hours];
      if (opts.showMoney) base.push(g.amount);
      return base;
    }),
    showMoney: opts.showMoney,
  });
  currentRow += 1;

  // Pivot 3 — par organisation (si pas déjà filtré sur 1 org)
  if (!opts.scoped && rows.length > 0) {
    currentRow = addPivotBlock({
      sheet,
      startRow: currentRow,
      title: "Heures par organisation",
      headers: opts.showMoney
        ? ["Organisation", "Entrées", "Heures", "Montant"]
        : ["Organisation", "Entrées", "Heures"],
      rows: aggregateBy(rows, (r) => r.organizationName).map((g) => {
        const base: (string | number)[] = [g.key, g.count, g.hours];
        if (opts.showMoney) base.push(g.amount);
        return base;
      }),
      showMoney: opts.showMoney,
    });
  }

  // Largeur des colonnes
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 10;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 14;
}

interface AggGroup { key: string; count: number; hours: number; amount: number }

function aggregateBy(rows: TimeEntryRow[], keyFn: (r: TimeEntryRow) => string): AggGroup[] {
  const map = new Map<string, AggGroup>();
  for (const r of rows) {
    const key = keyFn(r) || "—";
    const cur = map.get(key) ?? { key, count: 0, hours: 0, amount: 0 };
    cur.count += 1;
    cur.hours += r.durationMinutes / 60;
    cur.amount += r.amount ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    hours: Math.round(g.hours * 100) / 100,
    amount: Math.round(g.amount * 100) / 100,
  })).sort((a, b) => b.hours - a.hours);
}

function addPivotBlock(args: {
  sheet: ExcelJS.Worksheet;
  startRow: number;
  title: string;
  headers: string[];
  rows: (string | number)[][];
  showMoney: boolean;
}): number {
  const { sheet, startRow, title, headers, rows, showMoney } = args;
  let r = startRow;

  // Titre du bloc
  const titleCell = sheet.getCell(`A${r}`);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12, color: { argb: COLOR.ink } };
  r += 1;

  // Headers
  const headerRow = sheet.getRow(r);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: COLOR.headerFg }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right" };
    cell.border = { bottom: { style: "medium", color: { argb: COLOR.ink } } };
  });
  headerRow.height = 22;
  r += 1;

  // Data
  rows.forEach((row, idx) => {
    const dataRow = sheet.getRow(r);
    row.forEach((val, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = val;
      cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "top" };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.rowAlt } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: COLOR.hair } } };
    });
    // Format numérique colonnes 3 (heures) et 4 (montant)
    dataRow.getCell(3).numFmt = "0.00";
    if (showMoney) dataRow.getCell(4).numFmt = "$#,##0.00";
    r += 1;
  });

  // Total
  if (rows.length > 0) {
    const dataStartRow = startRow + 2;
    const dataEndRow = r - 1;
    const totalRow = sheet.getRow(r);
    totalRow.getCell(1).value = "Total";
    totalRow.getCell(2).value = { formula: `SUM(B${dataStartRow}:B${dataEndRow})` };
    totalRow.getCell(3).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})` };
    totalRow.getCell(3).numFmt = "0.00";
    if (showMoney) {
      totalRow.getCell(4).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})` };
      totalRow.getCell(4).numFmt = "$#,##0.00";
    }
    totalRow.eachCell({ includeEmpty: false }, (cell, col) => {
      cell.font = { bold: true, color: { argb: COLOR.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalRowBg } };
      cell.border = { top: { style: "medium", color: { argb: COLOR.ink } } };
      cell.alignment = { horizontal: col === 1 ? "left" : "right" };
    });
    r += 1;
  }

  return r;
}
