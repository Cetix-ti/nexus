// ============================================================================
// Téléchargement public d'installeur via token signé.
// GET  /d/<token>         → page HTML avec bouton (ou formulaire PIN si requis)
// POST /d/<token>         → vérifie PIN, stream le fichier
//
// Contrôles :
//   - token en DB
//   - non révoqué
//   - non expiré
//   - quota maxDownloads non dépassé
//   - PIN valide si requis
//   - rate-limit IP (mémoire, 10 tentatives / 60s)
//
// Audit : SoftwareDownloadAudit systématique (succès + échecs).
// Streaming : Response avec body stream pour ne pas charger en RAM.
// ============================================================================

import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveStoragePath } from "@/lib/software/storage";
import { verifyPin } from "@/lib/software/tokens";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";

// Rate-limit en mémoire — suffisant pour usage normal ; pour prod multi-instance,
// basculer sur Redis.
const RATE = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE.get(ip);
  if (!entry || entry.resetAt < now) {
    RATE.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

async function loadLink(token: string) {
  return prisma.softwareDownloadLink.findUnique({
    where: { token },
    include: { installer: true },
  });
}

async function audit(linkId: string, ip: string, ua: string | null, success: boolean, failureReason: string | null) {
  await prisma.softwareDownloadAudit.create({
    data: { linkId, ip, userAgent: ua, success, failureReason },
  });
  if (success) {
    await prisma.softwareDownloadLink.update({
      where: { id: linkId },
      data: { downloadCount: { increment: 1 }, lastUsedAt: new Date(), lastUsedIp: ip },
    });
  }
}

function htmlPage(opts: { title: string; body: string; status?: number }): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;color:#1e293b}
  .card{max-width:480px;margin:40px auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0}
  h1{font-size:20px;margin:0 0 8px 0}
  p{color:#64748b;font-size:14px;line-height:1.6;margin:8px 0}
  .btn{display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;border:none;cursor:pointer}
  .btn:hover{background:#1d4ed8}
  .err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:12px 14px;border-radius:8px;font-size:13px}
  input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;margin:8px 0}
  .muted{font-size:12px;color:#94a3b8;margin-top:16px}
</style>
</head>
<body>
  <div class="card">${opts.body}</div>
</body>
</html>`;
  return new Response(html, {
    status: opts.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex,nofollow" },
  });
}

function errorPage(title: string, message: string, status = 400): Response {
  return htmlPage({
    status,
    title,
    body: `<h1>${title}</h1><div class="err">${message}</div><p class="muted">Contactez votre fournisseur si ce lien devait fonctionner.</p>`,
  });
}

function pinPage(token: string, fileTitle: string): Response {
  return htmlPage({
    title: "Code requis",
    body: `
      <h1>Téléchargement protégé</h1>
      <p>Fichier : <strong>${escapeHtml(fileTitle)}</strong></p>
      <form method="post" action="/d/${encodeURIComponent(token)}">
        <label style="font-size:13px;color:#475569">Code d'accès à 6 chiffres</label>
        <input name="pin" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autofocus required>
        <button class="btn" type="submit">Télécharger</button>
      </form>
      <p class="muted">Lien sécurisé. Expire à usage ou à la date indiquée par votre fournisseur.</p>
    `,
  });
}

function readyPage(token: string, fileTitle: string, sizeBytes: number): Response {
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
  return htmlPage({
    title: "Téléchargement prêt",
    body: `
      <h1>Téléchargement prêt</h1>
      <p>Fichier : <strong>${escapeHtml(fileTitle)}</strong> (${mb} Mo)</p>
      <form method="post" action="/d/${encodeURIComponent(token)}">
        <button class="btn" type="submit">Télécharger</button>
      </form>
      <p class="muted">Ce lien est nominatif et audité.</p>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function serveFile(
  linkRecord: Awaited<ReturnType<typeof loadLink>>,
  ip: string,
  ua: string | null,
): Promise<Response> {
  if (!linkRecord) return errorPage("Lien introuvable", "Ce lien n'existe pas ou a été supprimé.", 404);
  const absPath = resolveStoragePath(linkRecord.installer.storagePath);
  try {
    const stat = await fs.stat(absPath);
    const stream = createReadStream(absPath);
    await audit(linkRecord.id, ip, ua, true, null);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(linkRecord.installer.filename)}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex,nofollow",
      },
    });
  } catch {
    await audit(linkRecord.id, ip, ua, false, "file-missing");
    return errorPage("Fichier indisponible", "Le fichier n'a pas pu être lu. Contactez votre fournisseur.", 500);
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = clientIp(req);
  if (!rateLimit(ip)) return errorPage("Trop de requêtes", "Patientez quelques instants avant de réessayer.", 429);

  const link = await loadLink(token);
  if (!link) return errorPage("Lien invalide", "Ce lien n'est pas valide.", 404);
  if (link.revokedAt) return errorPage("Lien révoqué", "Ce lien a été révoqué par son auteur.", 410);
  if (link.expiresAt < new Date()) return errorPage("Lien expiré", "Ce lien n'est plus valide.", 410);
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return errorPage("Quota atteint", "Ce lien a atteint son nombre maximal de téléchargements.", 410);
  }
  if (link.requirePin) return pinPage(token, link.installer.title);
  return readyPage(token, link.installer.title, link.installer.sizeBytes);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");
  if (!rateLimit(ip)) return errorPage("Trop de requêtes", "Patientez quelques instants avant de réessayer.", 429);

  const link = await loadLink(token);
  if (!link) return errorPage("Lien invalide", "Ce lien n'est pas valide.", 404);
  if (link.revokedAt) {
    await audit(link.id, ip, ua, false, "revoked");
    return errorPage("Lien révoqué", "Ce lien a été révoqué.", 410);
  }
  if (link.expiresAt < new Date()) {
    await audit(link.id, ip, ua, false, "expired");
    return errorPage("Lien expiré", "Ce lien n'est plus valide.", 410);
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    await audit(link.id, ip, ua, false, "quota");
    return errorPage("Quota atteint", "Ce lien a atteint son nombre maximal de téléchargements.", 410);
  }
  if (link.requirePin) {
    const form = await req.formData();
    const pin = String(form.get("pin") ?? "");
    if (!link.pinHash || !verifyPin(pin, link.pinHash)) {
      await audit(link.id, ip, ua, false, "bad-pin");
      // Auto-révoque le lien après 5 échecs PIN (défense anti-brute-force
      // même si le token fuite : l'attaquant ne peut essayer que 5 PIN
      // avant que le lien devienne inutilisable).
      const recentFailures = await prisma.softwareDownloadAudit.count({
        where: {
          linkId: link.id,
          success: false,
          failureReason: "bad-pin",
          downloadedAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      });
      if (recentFailures >= 5) {
        await prisma.softwareDownloadLink.update({
          where: { id: link.id },
          data: { revokedAt: new Date() },
        });
        return errorPage("Lien révoqué", "Trop d'échecs PIN : ce lien a été automatiquement révoqué.", 410);
      }
      return errorPage("Code incorrect", "Le code fourni est invalide.", 403);
    }
  }
  return serveFile(link, ip, ua);
}
