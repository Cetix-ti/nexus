// ============================================================================
// QUICKBOOKS ONLINE API CLIENT
// OAuth2 + REST API wrapper for QuickBooks Online
// ============================================================================

import prisma from "@/lib/prisma";

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_API_BASE = (realmId: string, sandbox: boolean) =>
  sandbox
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

const CONFIG_KEY = "quickbooks.config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sandbox: boolean;
  realmId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  connectedAt?: string;
  companyName?: string;
}

export interface QboInvoice {
  id: string;
  docNumber: string;
  customerName: string;
  totalAmount: number;
  balance: number;
  dueDate: string | null;
  txnDate: string;
  status: "Paid" | "Open" | "Overdue";
}

export interface QboCustomer {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  balance: number;
  active: boolean;
}

export interface QboPayment {
  id: string;
  totalAmount: number;
  txnDate: string;
  customerName: string;
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

export async function getQboConfig(): Promise<QboConfig | null> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return null;
  return row.value as unknown as QboConfig;
}

export async function setQboConfig(config: QboConfig) {
  await prisma.tenantSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as any },
    update: { value: config as any },
  });
}

// ---------------------------------------------------------------------------
// OAuth2 flow
// ---------------------------------------------------------------------------

export function getAuthUrl(): string {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || "http://localhost:3000/api/v1/integrations/quickbooks/callback";
  const scope = "com.intuit.quickbooks.accounting";
  const state = Math.random().toString(36).slice(2, 10);

  return `${QBO_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
}

export async function exchangeCode(code: string, realmId: string): Promise<QboConfig> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID!;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || "http://localhost:3000/api/v1/integrations/quickbooks/callback";

  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`QBO token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const config: QboConfig = {
    clientId,
    clientSecret,
    redirectUri,
    sandbox: process.env.QUICKBOOKS_SANDBOX === "true",
    realmId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    connectedAt: new Date().toISOString(),
  };

  // Get company info
  try {
    const companyInfo = await qboFetch(config, "/companyinfo/" + realmId);
    config.companyName = companyInfo?.CompanyInfo?.CompanyName;
  } catch { /* ignore */ }

  await setQboConfig(config);
  return config;
}

async function refreshAccessToken(config: QboConfig): Promise<QboConfig> {
  if (!config.refreshToken) throw new Error("No refresh token");

  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`QBO token refresh failed: ${res.status}`);
  const data = await res.json();

  config.accessToken = data.access_token;
  config.refreshToken = data.refresh_token;
  config.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await setQboConfig(config);
  return config;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function qboFetch(config: QboConfig, endpoint: string): Promise<any> {
  // Auto-refresh if token expired
  if (config.tokenExpiresAt && new Date(config.tokenExpiresAt) < new Date()) {
    config = await refreshAccessToken(config);
  }

  const baseUrl = QBO_API_BASE(config.realmId!, config.sandbox);
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
    },
  });

  if (res.status === 401) {
    // Token expired — refresh and retry
    config = await refreshAccessToken(config);
    const retry = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/json",
      },
    });
    if (!retry.ok) throw new Error(`QBO API ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`QBO API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function qboQuery(config: QboConfig, query: string): Promise<any> {
  const encoded = encodeURIComponent(query);
  return qboFetch(config, `/query?query=${encoded}`);
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

export async function getInvoices(config?: QboConfig | null): Promise<QboInvoice[]> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return [];

  const data = await qboQuery(cfg, "SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 100");
  const invoices = data?.QueryResponse?.Invoice ?? [];

  return invoices.map((inv: any) => ({
    id: inv.Id,
    docNumber: inv.DocNumber ?? "",
    customerName: inv.CustomerRef?.name ?? "",
    totalAmount: inv.TotalAmt ?? 0,
    balance: inv.Balance ?? 0,
    dueDate: inv.DueDate ?? null,
    txnDate: inv.TxnDate ?? "",
    status: inv.Balance === 0 ? "Paid" : (inv.DueDate && new Date(inv.DueDate) < new Date() ? "Overdue" : "Open"),
  }));
}

export async function getCustomers(config?: QboConfig | null): Promise<QboCustomer[]> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return [];

  const data = await qboQuery(cfg, "SELECT * FROM Customer ORDER BY DisplayName ASC MAXRESULTS 200");
  const customers = data?.QueryResponse?.Customer ?? [];

  return customers.map((c: any) => ({
    id: c.Id,
    displayName: c.DisplayName ?? "",
    companyName: c.CompanyName ?? null,
    email: c.PrimaryEmailAddr?.Address ?? null,
    balance: c.Balance ?? 0,
    active: c.Active !== false,
  }));
}

export async function getPayments(config?: QboConfig | null): Promise<QboPayment[]> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return [];

  const data = await qboQuery(cfg, "SELECT * FROM Payment ORDER BY TxnDate DESC MAXRESULTS 50");
  const payments = data?.QueryResponse?.Payment ?? [];

  return payments.map((p: any) => ({
    id: p.Id,
    totalAmount: p.TotalAmt ?? 0,
    txnDate: p.TxnDate ?? "",
    customerName: p.CustomerRef?.name ?? "",
  }));
}

export async function getCompanyInfo(config?: QboConfig | null): Promise<any> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return null;

  const data = await qboFetch(cfg, `/companyinfo/${cfg.realmId}`);
  return data?.CompanyInfo ?? null;
}

export async function getProfitAndLoss(config?: QboConfig | null): Promise<any> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return null;

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(new Date().setMonth(new Date().getMonth() - 12)).toISOString().split("T")[0];

  return qboFetch(cfg, `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`);
}

export async function getBalanceSheet(config?: QboConfig | null): Promise<any> {
  const cfg = config ?? await getQboConfig();
  if (!cfg?.accessToken || !cfg.realmId) return null;

  const endDate = new Date().toISOString().split("T")[0];
  return qboFetch(cfg, `/reports/BalanceSheet?date=${endDate}`);
}
