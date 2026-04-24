// ============================================================================
// PDF RENDER — Convertit la page de rendu interne en PDF haute qualité via
// Puppeteer (Chromium headless).
//
// Flow :
//   1. Signer un token court pour reportId.
//   2. Ouvrir `http://<self>/internal/reports/monthly/{id}?token=...`.
//   3. Attendre networkidle + fonts.ready (voir la page render).
//   4. page.pdf({ format: "Letter", printBackground: true, ... }).
//   5. Retourner Buffer.
//
// La page de rendu est un server component qui lit le payload depuis la DB
// et rend du Tailwind — sélection de texte, images vectorielles nettes,
// sauts de page CSS. Identique à un aperçu navigateur.
// ============================================================================

import { signReportToken } from "./token";

// Type stub minimal — évite de dépendre du package puppeteer pour le
// type-checking. L'import runtime est dynamique ci-dessous ; ajouter
// `puppeteer` dans package.json (fait) + installer avant d'utiliser.
type Browser = {
  connected: boolean;
  newPage(): Promise<unknown>;
  close(): Promise<void>;
};

/** Base URL à laquelle Puppeteer se connecte pour rendre la page.
 *  Préférence : NEXUS_SELF_URL (ex: http://localhost:3000). Fallback
 *  http://127.0.0.1:${PORT ?? 3000}. */
function getSelfBaseUrl(): string {
  if (process.env.NEXUS_SELF_URL) return process.env.NEXUS_SELF_URL.replace(/\/$/, "");
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

let browserPromise: Promise<Browser> | null = null;

/** Browser Puppeteer réutilisable entre les générations (cold start évité).
 *  Relancé si le process Chromium meurt. */
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected) return b;
    } catch {
      // Chute, on relance en dessous.
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any = await import("puppeteer" as string);
  const launched: Promise<Browser> = puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  browserPromise = launched;
  return launched;
}

export async function renderReportToPdf(reportId: string): Promise<Buffer> {
  const token = signReportToken(reportId);
  const base = getSelfBaseUrl();
  const url = `${base}/internal/reports/monthly/${reportId}?token=${encodeURIComponent(token)}`;

  const browser = await getBrowser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page: any = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 });
    const resp = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    if (!resp || !resp.ok()) {
      throw new Error(
        `Render page returned status ${resp?.status() ?? "unknown"} for ${url}`,
      );
    }
    // Attend que les polices soient chargées pour éviter les flashes.
    await page.evaluate(async () => {
      const doc = document as Document & {
        fonts?: { ready?: Promise<unknown> };
      };
      if (doc.fonts?.ready) await doc.fonts.ready;
    });

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%;font-family:'Helvetica',sans-serif;font-size:8px;color:#64748b;padding:0 10mm;display:flex;justify-content:space-between;">
          <span>Rapport mensuel — Cetix</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Ferme le browser partagé — utile en hot reload dev ou tests. */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    // Ignore
  }
  browserPromise = null;
}
