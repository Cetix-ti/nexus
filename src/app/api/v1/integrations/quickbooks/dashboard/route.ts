import { NextResponse } from "next/server";
import {
  getQboConfig,
  getInvoices,
  getCustomers,
  getPayments,
  getProfitAndLoss,
  getBalanceSheet,
} from "@/lib/quickbooks/client";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/integrations/quickbooks/dashboard
 *
 * Returns comprehensive QuickBooks data for dashboards:
 * - KPIs (receivable, overdue, revenue, expenses)
 * - Invoice aging breakdown
 * - Revenue by customer
 * - Monthly revenue trend (from P&L)
 * - Recent payments
 * - Customer balances
 * - P&L summary
 * - Balance sheet summary
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const config = await getQboConfig();
    if (!config?.accessToken || !config.realmId) {
      return NextResponse.json({ error: "QuickBooks non connecté", connected: false }, { status: 200 });
    }

    const [invoices, customers, payments, pnlRaw, bsRaw] = await Promise.all([
      getInvoices(config),
      getCustomers(config),
      getPayments(config),
      getProfitAndLoss(config),
      getBalanceSheet(config),
    ]);

    // ── KPIs ──
    const totalReceivable = invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + i.balance, 0);
    const totalOverdue = invoices.filter((i) => i.status === "Overdue").reduce((s, i) => s + i.balance, 0);
    const totalPaid = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.totalAmount, 0);
    const recentPaymentsTotal = payments.slice(0, 20).reduce((s, p) => s + p.totalAmount, 0);
    const openInvoices = invoices.filter((i) => i.status === "Open").length;
    const overdueInvoices = invoices.filter((i) => i.status === "Overdue").length;
    const avgInvoiceAmount = invoices.length > 0 ? Math.round(invoices.reduce((s, i) => s + i.totalAmount, 0) / invoices.length * 100) / 100 : 0;
    const avgDaysToPayment = (() => {
      const paid = invoices.filter((i) => i.status === "Paid" && i.dueDate && i.txnDate);
      if (paid.length === 0) return 0;
      const total = paid.reduce((s, i) => {
        const created = new Date(i.txnDate).getTime();
        const due = new Date(i.dueDate!).getTime();
        return s + Math.max(0, (due - created) / 86400000);
      }, 0);
      return Math.round(total / paid.length);
    })();

    // ── Invoice aging ──
    const now = new Date();
    const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const inv of invoices) {
      if (inv.status === "Paid" || inv.balance <= 0) continue;
      if (!inv.dueDate) { aging.current += inv.balance; continue; }
      const daysOverdue = Math.max(0, (now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      if (daysOverdue <= 0) aging.current += inv.balance;
      else if (daysOverdue <= 30) aging.days30 += inv.balance;
      else if (daysOverdue <= 60) aging.days60 += inv.balance;
      else if (daysOverdue <= 90) aging.days90 += inv.balance;
      else aging.over90 += inv.balance;
    }

    // ── Revenue by customer ──
    const revByCustomer = new Map<string, { name: string; invoiced: number; paid: number; balance: number; count: number }>();
    for (const inv of invoices) {
      const c = revByCustomer.get(inv.customerName) || { name: inv.customerName, invoiced: 0, paid: 0, balance: 0, count: 0 };
      c.invoiced += inv.totalAmount;
      c.paid += inv.totalAmount - inv.balance;
      c.balance += inv.balance;
      c.count += 1;
      revByCustomer.set(inv.customerName, c);
    }
    const revenueByCustomer = Array.from(revByCustomer.values()).sort((a, b) => b.invoiced - a.invoiced);

    // ── Monthly revenue from invoices ──
    const monthlyMap = new Map<string, { invoiced: number; paid: number; count: number }>();
    for (const inv of invoices) {
      if (!inv.txnDate) continue;
      const d = new Date(inv.txnDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = monthlyMap.get(key) || { invoiced: 0, paid: 0, count: 0 };
      m.invoiced += inv.totalAmount;
      if (inv.status === "Paid") m.paid += inv.totalAmount;
      m.count += 1;
      monthlyMap.set(key, m);
    }
    // Sort by month
    const monthlyRevenue = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, d]) => ({
        month,
        invoiced: Math.round(d.invoiced * 100) / 100,
        paid: Math.round(d.paid * 100) / 100,
        count: d.count,
      }));

    // ── P&L Summary ──
    let pnlSummary = null;
    if (pnlRaw) {
      const rows = pnlRaw?.Rows?.Row ?? [];
      const findRow = (name: string) => rows.find((r: any) => r?.Summary?.ColData?.[0]?.value === name);
      const getValue = (row: any) => parseFloat(row?.Summary?.ColData?.[1]?.value ?? "0") || 0;
      const income = findRow("Total Income");
      const cogs = findRow("Total Cost of Goods Sold");
      const expenses = findRow("Total Expenses");
      const netIncome = findRow("Net Income");
      pnlSummary = {
        totalIncome: getValue(income),
        totalCOGS: getValue(cogs),
        grossProfit: getValue(income) - getValue(cogs),
        totalExpenses: getValue(expenses),
        netIncome: getValue(netIncome),
        period: pnlRaw?.Header?.StartPeriod && pnlRaw?.Header?.EndPeriod
          ? { start: pnlRaw.Header.StartPeriod, end: pnlRaw.Header.EndPeriod }
          : null,
      };
    }

    // ── Balance Sheet Summary ──
    let bsSummary = null;
    if (bsRaw) {
      const rows = bsRaw?.Rows?.Row ?? [];
      const findSection = (name: string) => rows.find((r: any) => r?.Header?.ColData?.[0]?.value === name);
      const getSectionTotal = (section: any) => parseFloat(section?.Summary?.ColData?.[1]?.value ?? "0") || 0;
      const assets = findSection("ASSETS") ?? findSection("Assets");
      const liabilities = findSection("LIABILITIES AND EQUITY") ?? findSection("Liabilities and Equity");
      bsSummary = {
        totalAssets: getSectionTotal(assets),
        totalLiabilitiesAndEquity: getSectionTotal(liabilities),
        asOf: bsRaw?.Header?.EndPeriod ?? null,
      };
    }

    // ── Top overdue invoices ──
    const topOverdue = invoices
      .filter((i) => i.status === "Overdue")
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    return NextResponse.json({
      connected: true,
      companyName: config.companyName,
      sandbox: config.sandbox,
      kpis: {
        totalReceivable: Math.round(totalReceivable * 100) / 100,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        recentPaymentsTotal: Math.round(recentPaymentsTotal * 100) / 100,
        invoiceCount: invoices.length,
        openInvoices,
        overdueInvoices,
        customerCount: customers.length,
        avgInvoiceAmount,
        avgDaysToPayment,
      },
      aging: {
        current: Math.round(aging.current * 100) / 100,
        days30: Math.round(aging.days30 * 100) / 100,
        days60: Math.round(aging.days60 * 100) / 100,
        days90: Math.round(aging.days90 * 100) / 100,
        over90: Math.round(aging.over90 * 100) / 100,
      },
      revenueByCustomer,
      monthlyRevenue,
      topOverdue,
      recentPayments: payments.slice(0, 20),
      customerBalances: customers.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance),
      pnlSummary,
      bsSummary,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur QuickBooks", connected: true }, { status: 500 });
  }
}
