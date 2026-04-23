// GET /api/v1/bugs/approval?token=... — approbation ou rejet via email.
// Utilisé par les liens dans les notifications email. Token signé TTL 48h.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyBugApprovalToken } from "@/lib/bugs/approval-token";

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;margin:0;padding:40px 16px}
.card{max-width:480px;margin:40px auto;background:white;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0}
h1{margin:0 0 10px 0;font-size:20px}p{color:#475569;line-height:1.6;font-size:14px}
.ok{color:#047857}.err{color:#b91c1c}</style></head>
<body><div class="card">${body}</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";
  const v = verifyBugApprovalToken(token);
  if (!v) return page("Lien invalide", `<h1 class="err">Lien invalide ou expiré</h1><p>Ce lien d'approbation ne peut plus être utilisé. Retournez dans Nexus pour agir sur le bug.</p>`, 400);

  const bug = await prisma.bugReport.findUnique({ where: { id: v.bugId }, select: { id: true, title: true, status: true } });
  if (!bug) return page("Bug introuvable", `<h1 class="err">Bug introuvable</h1>`, 404);

  if (v.action === "approve") {
    if (!["NEW", "TRIAGED", "REJECTED"].includes(bug.status)) {
      return page("Déjà traité", `<h1>Déjà traité</h1><p>Ce bug est en statut <strong>${bug.status}</strong> — aucune action requise.</p>`);
    }
    await prisma.bugReport.update({
      where: { id: bug.id },
      data: {
        status: "APPROVED_FOR_FIX",
        approvedForAutoFixAt: new Date(),
        // Note : pas de approvedByUserId car pas de session. Le lien email
        // est une délégation d'approbation ; on trace "via email" dans
        // rejection/approval logs futures si besoin.
        rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
      },
    });
    return page("Bug approuvé", `<h1 class="ok">Bug approuvé pour auto-fix</h1><p>Le worker Claude prendra ce bug lors de la prochaine fenêtre nocturne (22h–6h).</p><p><strong>Bug :</strong> ${bug.title}</p>`);
  } else {
    if (bug.status === "FIXED") {
      return page("Déjà fixé", `<h1>Déjà fixé</h1><p>Ce bug a déjà été résolu.</p>`);
    }
    await prisma.bugReport.update({
      where: { id: bug.id },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: "Rejeté via email" },
    });
    return page("Bug rejeté", `<h1 class="ok">Bug rejeté</h1><p>Aucune tentative de fix automatique ne sera lancée.</p><p><strong>Bug :</strong> ${bug.title}</p>`);
  }
}
