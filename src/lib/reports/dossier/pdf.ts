// Rendu PDF du dossier 360 via Puppeteer — réutilise le browser singleton
// déjà lancé par reports/monthly (bonne citoyenneté : un seul Chromium).

import { signDossierToken } from "./token";

type Browser = { connected: boolean; newPage(): Promise<unknown>; close(): Promise<void> };

function selfBaseUrl() {
  if (process.env.NEXUS_SELF_URL) return process.env.NEXUS_SELF_URL.replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected) return b;
    } catch { /* relance */ }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any = await import("puppeteer" as string);
  browserPromise = puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return browserPromise!;
}

export async function renderDossierToPdf(orgId: string): Promise<Buffer> {
  const token = signDossierToken(orgId);
  const url = `${selfBaseUrl()}/internal/reports/client-dossier/${orgId}?token=${encodeURIComponent(token)}`;
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
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center;padding:0 10mm;">Dossier client 360° · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
