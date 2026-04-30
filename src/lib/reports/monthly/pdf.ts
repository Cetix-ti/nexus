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
import prisma from "@/lib/prisma";
import { signReportToken } from "./token";
import type { MonthlyReportPayload } from "./types";

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

export async function renderReportToPdf(
  reportId: string,
  opts: { hideRates?: boolean } = {},
): Promise<Buffer> {
  const token = signReportToken(reportId);
  const base = getSelfBaseUrl();
  // Le défaut côté page interne est SANS montants $ (hideRates=true).
  // On envoie ?variant=with_amounts seulement quand on veut la version $.
  const variantQs = opts.hideRates === false ? `&variant=with_amounts` : "";
  const url = `${base}/internal/reports/monthly/${reportId}?token=${encodeURIComponent(token)}${variantQs}`;

  // Récupère le label de période pour le footer (ex « Avril 2026 »).
  // Best-effort : si la lecture échoue, on tombe sur un footer générique.
  let periodLabel: string | null = null;
  try {
    const row = await prisma.monthlyClientReport.findUnique({
      where: { id: reportId },
      select: { payloadJson: true },
    });
    const payload = row?.payloadJson as unknown as MonthlyReportPayload | null;
    if (payload?.period?.label) {
      const lbl = payload.period.label;
      periodLabel = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    }
  } catch {
    // Ignoré — footer rendu sans period
  }

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
      // GOTCHA Chromium 147 : les marges horizontales (left/right) de
      // page.pdf({margin}) sont silencieusement IGNORÉES quand
      // displayHeaderFooter=true. Mesuré : peu importe la valeur passée
      // (18mm, 30mm, 40mm), le body content tombe à ~10mm de chaque bord
      // — Chrome utilise ses defaults pour le horizontal. Seules les
      // marges top/bottom sont honorées (réservent l'espace pour
      // header/footer template).
      // Conséquence : le footerTemplate doit appliquer `padding: 0 10mm`
      // pour s'aligner sur le body (cf. buildFooterTemplate ci-dessous).
      // Si Chrome corrige un jour ce comportement, ajuster les deux
      // ensemble. Référence : github.com/puppeteer/puppeteer/issues/1822
      margin: { top: "18mm", right: "10mm", bottom: "20mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: await buildFooterTemplate(periodLabel),
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
async function buildFooterTemplate(periodLabel: string | null): Promise<string> {
  const logoDataUri = await getLogoDataUri();
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" style="height:17px;width:auto;display:block;" alt="Cetix" />`
    : "";
  // Note : Puppeteer footerTemplate exige des styles INLINE — pas de CSS
  // externe, pas de classes Tailwind. Polices de fallback système car
  // Geist n'est pas disponible dans le contexte d'impression Puppeteer.
  //
  // GOTCHA Chromium : `footerTemplate` est rendu dans un iframe interne
  // à un scale de 0.75x — donc une valeur écrite "18mm" donne ~13.5mm
  // visuellement, et le footer apparaît décalé du contenu principal qui
  // a vraiment 18mm de marge.
  // Compensation : on multiplie par 1/0.75 ≈ 1.333. Donc :
  //   - padding horizontal 18mm × 1.333 = 24mm (aligne sur le body)
  //   - font-size écrit ~33% plus grand (8.5px → 11px) pour matcher le
  //     ressenti visuel attendu.
  // Référence : https://github.com/puppeteer/puppeteer/issues/1822
  const periodSegment = periodLabel
    ? `<span style="color:#94A3B8;margin:0 4px;">·</span><span style="color:#0F172A;font-weight:500;">${periodLabel}</span>`
    : "";
  return `
    <div style="width:100%;box-sizing:border-box;padding:0 10mm;margin:0;display:flex;align-items:center;justify-content:space-between;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:11px;color:#64748B;">
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${logoImg}
        <span style="font-weight:500;color:#0F172A;">Cetix</span>
        <span style="color:#94A3B8;margin:0 2px;">·</span>
        <span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">Rapport mensuel</span>
        ${periodSegment}
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;color:#0F172A;font-weight:500;flex-shrink:0;">
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
