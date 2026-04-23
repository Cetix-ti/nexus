// Rendu PDF d'un budget via Puppeteer. Ouvre la page interne
// /internal/reports/budget/[id]?token=... qui server-renders le budget,
// puis capture en PDF.

import puppeteer, { type Browser } from "puppeteer";
import { signBudgetToken } from "./token";

function selfBaseUrl(): string {
  return process.env.NEXUS_SELF_URL ?? "http://127.0.0.1:3000";
}

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try { return await browserPromise; } catch { browserPromise = null; }
  }
  browserPromise = puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return browserPromise!;
}

export async function renderBudgetToPdf(budgetId: string): Promise<Buffer> {
  const token = signBudgetToken(budgetId);
  const url = `${selfBaseUrl()}/internal/reports/budget/${budgetId}?token=${encodeURIComponent(token)}`;
  const browser = await getBrowser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page: any = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 });
    const resp = await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    if (!resp || !resp.ok()) throw new Error(`Render failed (${resp?.status()})`);
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "15mm", right: "12mm", bottom: "15mm", left: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center;padding:0 10mm;">Budget IT · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
