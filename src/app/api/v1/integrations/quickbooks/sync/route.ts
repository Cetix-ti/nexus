import { NextResponse } from "next/server";
import {
  getInvoices,
  getCustomers,
  getPayments,
  getCompanyInfo,
  getProfitAndLoss,
  getBalanceSheet,
} from "@/lib/quickbooks/client";
import { getCurrentUser } from "@/lib/auth-utils";

/** GET — fetch all QBO data for the finances dashboard */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section"); // invoices, customers, payments, reports, all

    if (section === "invoices") {
      return NextResponse.json({ invoices: await getInvoices() });
    }
    if (section === "customers") {
      return NextResponse.json({ customers: await getCustomers() });
    }
    if (section === "payments") {
      return NextResponse.json({ payments: await getPayments() });
    }
    if (section === "reports") {
      const [pnl, bs] = await Promise.all([
        getProfitAndLoss(),
        getBalanceSheet(),
      ]);
      return NextResponse.json({ profitAndLoss: pnl, balanceSheet: bs });
    }

    // All data
    const [invoices, customers, payments, companyInfo] = await Promise.all([
      getInvoices(),
      getCustomers(),
      getPayments(),
      getCompanyInfo(),
    ]);

    // Compute summary
    const totalReceivable = invoices
      .filter((i) => i.status !== "Paid")
      .reduce((s, i) => s + i.balance, 0);
    const totalOverdue = invoices
      .filter((i) => i.status === "Overdue")
      .reduce((s, i) => s + i.balance, 0);
    const recentPaymentsTotal = payments
      .slice(0, 10)
      .reduce((s, p) => s + p.totalAmount, 0);

    return NextResponse.json({
      companyInfo,
      summary: {
        totalReceivable: Math.round(totalReceivable * 100) / 100,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        recentPaymentsTotal: Math.round(recentPaymentsTotal * 100) / 100,
        invoiceCount: invoices.length,
        customerCount: customers.length,
        openInvoices: invoices.filter((i) => i.status === "Open").length,
        overdueInvoices: invoices.filter((i) => i.status === "Overdue").length,
      },
      invoices,
      customers: customers.slice(0, 50),
      payments: payments.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur QuickBooks" },
      { status: 500 },
    );
  }
}
