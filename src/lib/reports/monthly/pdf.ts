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

import { readFile } from "node:fs/promises";
import path from "node:path";
import { signReportToken } from "./token";

// Logo Cetix encodé en base64, mis en cache pour la durée du process.
// Embedded directement dans le footerTemplate Puppeteer (qui n'a pas
// accès aux assets du serveur Next.js — il rend dans un contexte
// totalement isolé).
let cachedLogoDataUri: string | null = null;
async function getLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const p = path.join(process.cwd(), "public", "images", "cetix-transparent-emblem.png");
    const buf = await readFile(p);
    cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    return cachedLogoDataUri;
  } catch {
    // Fallback : variant horizontal HD si l'emblème n'existe pas
    try {
      const p = path.join(process.cwd(), "public", "images", "cetix-logo-bleu-horizontal-HD.png");
      const buf = await readFile(p);
      cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
      return cachedLogoDataUri;
    } catch {
      return null;
    }
  }
}

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
      // preferCSSPageSize désactivé — on veut que les marges Puppeteer
      // soient autoritaires (le @page CSS du document n'override plus).
      // Marges symétriques 18mm sur les 4 côtés. Le footer est rendu
      // À L'INTÉRIEUR de la marge bottom — donc 18mm doit être suffisant
      // pour son contenu (logo 14px + texte ~10px + padding) tout en
      // laissant l'impression d'une marge cohérente avec les autres bords.
      margin: { top: "18mm", right: "18mm", bottom: "20mm", left: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: await buildFooterTemplate(),
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Footer rendu sur chaque page du PDF — emblème Cetix à gauche +
 * « Rapport mensuel » + numéro de page en mono à droite. Le template
 * Puppeteer s'exécute dans un contexte isolé (pas d'accès aux assets
 * Next.js), d'où l'embedding du logo en base64.
 */
async function buildFooterTemplate(): Promise<string> {
  const logoDataUri = await getLogoDataUri();
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" style="height:14px;width:auto;display:block;" alt="Cetix" />`
    : "";
  // Note : Puppeteer footerTemplate exige des styles INLINE — pas de CSS
  // externe, pas de classes Tailwind. Polices de fallback système car
  // Geist n'est pas disponible dans le contexte d'impression Puppeteer.
  return `
    <div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:8.5px;color:#64748B;">
      <div style="display:flex;align-items:center;gap:8px;">
        ${logoImg}
        <span style="font-weight:500;">Cetix</span>
        <span style="color:#94A3B8;">·</span>
        <span style="font-size:8px;letter-spacing:0.08em;text-transform:uppercase;color:#94A3B8;">Rapport mensuel</span>
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:9px;color:#0F172A;font-weight:500;">
        <span class="pageNumber"></span> <span style="color:#94A3B8;">/</span> <span class="totalPages"></span>
      </div>
    </div>`;
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
