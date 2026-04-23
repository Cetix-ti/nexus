// Emails pour le module Bug Reports :
//   - newBug : nouveau signalement (pour triage)
//   - fixProposed : PR prête (pour review/merge)
//   - dailyDigest : résumé quotidien matinal
//
// Destinataire par défaut : env BUG_REPORTS_NOTIFY_EMAIL, fallback
// informatique@cetix.ca.

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { signBugApprovalToken } from "@/lib/bugs/approval-token";

function notifyEmail(): string {
  return process.env.BUG_REPORTS_NOTIFY_EMAIL ?? "informatique@cetix.ca";
}
function appUrl(): string {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://nexus.cetix.ca";
}

const SEVERITY_LABEL: Record<string, string> = { LOW: "Mineur", MEDIUM: "Moyen", HIGH: "Majeur", CRITICAL: "Critique" };
const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau", TRIAGED: "Trié", APPROVED_FOR_FIX: "Approuvé",
  FIX_IN_PROGRESS: "Fix en cours", FIX_PROPOSED: "PR proposée",
  FIXED: "Fixé", REJECTED: "Rejeté", DUPLICATE: "Doublon",
};

function wrapHtml(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b">
<div style="max-width:640px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<div style="padding:18px 22px;background:linear-gradient(135deg,#0f172a,#1e293b);color:white">
<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7">Nexus · Bug Reports</div>
<div style="font-size:20px;font-weight:600;margin-top:4px">${escapeHtml(title)}</div>
</div>
<div style="padding:22px">${body}</div>
<div style="padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
Nexus · envoyé automatiquement · ne pas répondre</div>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function btn(label: string, href: string, color = "#2563eb"): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500;margin-right:6px">${escapeHtml(label)}</a>`;
}

// ============================================================================
// 1. New bug — pour toi, avec approve/reject one-click
// ============================================================================
export async function sendNewBugEmail(bugId: string): Promise<boolean> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    include: { reporter: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!bug) return false;

  const approveToken = signBugApprovalToken(bugId, "approve");
  const rejectToken = signBugApprovalToken(bugId, "reject");
  const base = appUrl();
  const approveUrl = `${base}/api/v1/bugs/approval?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${base}/api/v1/bugs/approval?token=${encodeURIComponent(rejectToken)}`;
  const detailUrl = `${base}/admin/bugs/${bug.id}`;

  const severityColors: Record<string, string> = {
    LOW: "#64748b", MEDIUM: "#d97706", HIGH: "#ea580c", CRITICAL: "#dc2626",
  };
  const sevColor = severityColors[bug.severity] ?? "#64748b";

  const body = `
<div style="font-size:13px;color:#64748b;margin-bottom:8px">
<span style="display:inline-block;background:${sevColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${SEVERITY_LABEL[bug.severity] ?? bug.severity}</span>
&nbsp;signalé par ${bug.reporter ? escapeHtml(`${bug.reporter.firstName} ${bug.reporter.lastName}`) : "(inconnu)"}
</div>
<h2 style="margin:0 0 8px 0;font-size:17px">${escapeHtml(bug.title)}</h2>
<p style="white-space:pre-wrap;font-size:13px;color:#334155;line-height:1.55">${escapeHtml(bug.description.slice(0, 800))}${bug.description.length > 800 ? "…" : ""}</p>
${bug.contextUrl ? `<div style="font-size:11.5px;color:#64748b;margin-top:8px"><strong>URL :</strong> <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${escapeHtml(bug.contextUrl)}</code></div>` : ""}
<div style="margin-top:20px">
  ${btn("✓ Approuver pour auto-fix", approveUrl, "#059669")}
  ${btn("✕ Rejeter", rejectUrl, "#64748b")}
  ${btn("Voir dans Nexus", detailUrl, "#0f172a")}
</div>
<p style="font-size:11px;color:#94a3b8;margin-top:18px">
L'approbation enclenche le worker Claude nocturne (22h-6h). Le worker propose une PR — tu gardes le contrôle du merge.
</p>`;
  const subject = `[Bug ${bug.severity}] ${bug.title}`;
  return sendEmail(notifyEmail(), subject, wrapHtml("Nouveau bug signalé", body), {
    from: { name: "Nexus Bugs", email: notifyEmail() },
  });
}

// ============================================================================
// 2. Fix proposed — PR prête à merger
// ============================================================================
export async function sendFixProposedEmail(attemptId: string): Promise<boolean> {
  const attempt = await prisma.bugFixAttempt.findUnique({
    where: { id: attemptId },
    include: { bug: true },
  });
  if (!attempt || !attempt.prUrl) return false;
  const bug = attempt.bug;
  const detailUrl = `${appUrl()}/admin/bugs/${bug.id}`;
  const confidencePct = attempt.confidence != null ? Math.round(attempt.confidence * 100) : null;

  const body = `
<div style="font-size:13px;color:#64748b;margin-bottom:8px">
PR automatique générée par <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${escapeHtml(attempt.agentModel)}</code>
${confidencePct != null ? ` · Confiance ${confidencePct}%` : ""}
</div>
<h2 style="margin:0 0 8px 0;font-size:17px">${escapeHtml(bug.title)}</h2>
<p style="font-size:13px;color:#334155;line-height:1.55;white-space:pre-wrap">${escapeHtml(attempt.diffSummary ?? "(pas de résumé)")}</p>
${attempt.filesChanged.length ? `<div style="font-size:12px;color:#64748b;margin-top:8px"><strong>Fichiers :</strong> ${attempt.filesChanged.slice(0, 10).map(escapeHtml).join(", ")}${attempt.filesChanged.length > 10 ? ` (+${attempt.filesChanged.length - 10})` : ""}</div>` : ""}
<div style="margin-top:20px">
  ${btn("Voir la PR GitHub", attempt.prUrl, "#6366f1")}
  ${btn("Voir le bug dans Nexus", detailUrl, "#0f172a")}
</div>
<p style="font-size:11px;color:#94a3b8;margin-top:18px">
Reviewer le code, puis merger via GitHub. Aucun merge automatique — tu gardes le contrôle.
</p>`;
  const subject = `[PR à merger] ${bug.title}`;
  return sendEmail(notifyEmail(), subject, wrapHtml("Fix proposé", body), {
    from: { name: "Nexus Bugs", email: notifyEmail() },
  });
}

// ============================================================================
// 3. Digest quotidien — résumé matinal
// ============================================================================
export async function sendDailyDigestEmail(options: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string }> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [newBugs, fixedBugs, fixProposed, pendingApproval, runningAttempts] = await Promise.all([
    prisma.bugReport.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      include: { reporter: { select: { firstName: true, lastName: true } } },
    }),
    prisma.bugReport.findMany({
      where: { status: "FIXED", updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.bugReport.findMany({
      where: { status: "FIX_PROPOSED" },
      include: { fixAttempts: { orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.bugReport.findMany({
      where: { status: { in: ["NEW", "TRIAGED"] } },
      orderBy: { createdAt: "asc" },
      include: { reporter: { select: { firstName: true, lastName: true } } },
      take: 20,
    }),
    prisma.bugFixAttempt.findMany({
      where: { status: "ANALYZING", startedAt: { gte: since } },
      include: { bug: true },
    }),
  ]);

  if (!options.force &&
      newBugs.length === 0 && fixedBugs.length === 0 &&
      fixProposed.length === 0 && pendingApproval.length === 0) {
    return { sent: false, reason: "Aucune activité — digest sauté." };
  }

  const base = appUrl();
  type BugWithReporter = typeof newBugs[number];
  function bugLine(b: BugWithReporter): string {
    const rep = b.reporter;
    return `<li style="margin:4px 0"><a href="${base}/admin/bugs/${b.id}" style="color:#2563eb;text-decoration:none">${escapeHtml(b.title)}</a> <span style="color:#94a3b8;font-size:11px">· ${SEVERITY_LABEL[b.severity]}${rep ? ` · ${escapeHtml(`${rep.firstName} ${rep.lastName}`)}` : ""}</span></li>`;
  }

  const sections: string[] = [];

  if (fixProposed.length > 0) {
    sections.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#4f46e5">🔁 PRs en attente de merge (${fixProposed.length})</h3>
<ul style="margin:0;padding-left:18px">${fixProposed.map((b) => {
  const pr = b.fixAttempts[0];
  return `<li style="margin:4px 0"><a href="${pr?.prUrl ?? `${base}/admin/bugs/${b.id}`}" style="color:#4f46e5;text-decoration:none"><strong>${escapeHtml(b.title)}</strong></a>${pr?.confidence != null ? ` <span style="color:#94a3b8;font-size:11px">· confiance ${Math.round(pr.confidence * 100)}%</span>` : ""}</li>`;
}).join("")}</ul>`);
  }

  if (newBugs.length > 0) {
    sections.push(`<h3 style="margin:18px 0 6px 0;font-size:14px">🆕 Nouveaux bugs aujourd'hui (${newBugs.length})</h3>
<ul style="margin:0;padding-left:18px">${newBugs.map(bugLine).join("")}</ul>`);
  }

  if (fixedBugs.length > 0) {
    sections.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#059669">✅ Bugs fixés dans les 24h (${fixedBugs.length})</h3>
<ul style="margin:0;padding-left:18px">${fixedBugs.map((b) => `<li style="margin:4px 0">${escapeHtml(b.title)}</li>`).join("")}</ul>`);
  }

  if (pendingApproval.length > 0) {
    sections.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#d97706">⏳ En attente de triage (${pendingApproval.length})</h3>
<ul style="margin:0;padding-left:18px">${pendingApproval.slice(0, 8).map(bugLine).join("")}${pendingApproval.length > 8 ? `<li style="color:#94a3b8;font-size:11px">… et ${pendingApproval.length - 8} autres</li>` : ""}</ul>`);
  }

  if (runningAttempts.length > 0) {
    sections.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#0891b2">⚙️ Fixes lancés cette nuit (${runningAttempts.length})</h3>
<ul style="margin:0;padding-left:18px">${runningAttempts.map((a) => `<li style="margin:4px 0">${escapeHtml(a.bug.title)} <span style="color:#94a3b8;font-size:11px">· ${a.agentModel}</span></li>`).join("")}</ul>`);
  }

  const body = `
<p style="font-size:13px;color:#475569;margin:0 0 4px 0">Résumé quotidien ${new Date().toLocaleDateString("fr-CA")}</p>
${sections.join("")}
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0">
  ${btn("Ouvrir le dashboard", `${base}/admin/bugs`, "#0f172a")}
</div>`;

  const subject = `[Bugs] Résumé ${new Date().toLocaleDateString("fr-CA")} — ${newBugs.length} nouveau(x), ${fixedBugs.length} fixé(s), ${fixProposed.length} PR à merger`;
  const ok = await sendEmail(notifyEmail(), subject, wrapHtml("Résumé quotidien", body), {
    from: { name: "Nexus Bugs", email: notifyEmail() },
  });
  return { sent: ok };
}
