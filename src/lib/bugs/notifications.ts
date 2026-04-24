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
import { buildNexusEmail } from "@/lib/email/nexus-template";

function notifyEmail(): string {
  return process.env.BUG_REPORTS_NOTIFY_EMAIL ?? "informatique@cetix.ca";
}
function appUrl(): string {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://nexus.cetix.ca";
}

const SEVERITY_LABEL: Record<string, string> = { LOW: "Mineur", MEDIUM: "Moyen", HIGH: "Majeur", CRITICAL: "Critique" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function actionBtn(label: string, href: string, bg: string): string {
  return `<a href="${href}" style="display:inline-block;background:${bg};color:white;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;margin-right:8px;margin-bottom:8px;">${escapeHtml(label)}</a>`;
}

function quoteStyle(accentColor: string): string {
  return `border-left:3px solid ${accentColor};background:#F8FAFC;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap;`;
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

  const reporterName = bug.reporter
    ? `${bug.reporter.firstName} ${bug.reporter.lastName}`
    : "(inconnu)";

  const desc = bug.description.slice(0, 800) + (bug.description.length > 800 ? "…" : "");

  const body = `
<div style="${quoteStyle("#991B1B")}">${escapeHtml(desc)}</div>
<div style="margin:0 0 16px;">
  ${actionBtn("✓ Approuver pour auto-fix", approveUrl, "#059669")}
  ${actionBtn("✕ Rejeter", rejectUrl, "#64748b")}
</div>
<p style="font-size:11px;color:#94a3b8;margin:0;">
  L'approbation enclenche le worker Claude nocturne (22h–6h). Le worker propose une PR — tu gardes le contrôle du merge.
</p>`;

  const html = buildNexusEmail({
    event: "bug_reported",
    preheader: `Bug ${SEVERITY_LABEL[bug.severity] ?? bug.severity} – ${bug.title}`,
    title: bug.title,
    intro: `Signalé par ${reporterName}`,
    metadata: [
      { label: "Sévérité", value: SEVERITY_LABEL[bug.severity] ?? bug.severity },
      { label: "Signalé par", value: reporterName },
      ...(bug.contextUrl ? [{ label: "URL", value: bug.contextUrl }] : []),
      { label: "Date", value: new Date(bug.createdAt).toLocaleString("fr-CA") },
    ],
    body,
    ctaUrl: detailUrl,
    ctaLabel: "Voir dans Nexus",
  });

  const subject = `[Bug ${bug.severity}] ${bug.title}`;
  return sendEmail(notifyEmail(), subject, html, {
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

  const filesStr = attempt.filesChanged.length
    ? attempt.filesChanged.slice(0, 8).map(escapeHtml).join(", ") +
      (attempt.filesChanged.length > 8 ? ` (+${attempt.filesChanged.length - 8})` : "")
    : null;

  const diffSummary = attempt.diffSummary ?? "(pas de résumé)";

  const body = `
<div style="${quoteStyle("#5B21B6")}">${escapeHtml(diffSummary)}</div>
<div style="margin:0 0 12px;">
  ${actionBtn("Voir le bug dans Nexus", detailUrl, "#0f172a")}
</div>
<p style="font-size:11px;color:#94a3b8;margin:0;">
  Reviewer le code, puis merger via GitHub. Aucun merge automatique — tu gardes le contrôle.
</p>`;

  const html = buildNexusEmail({
    event: "bug_fix_proposed",
    preheader: `PR prête à merger — ${bug.title}`,
    title: bug.title,
    intro: `Fix automatique généré par ${attempt.agentModel}${confidencePct != null ? ` · Confiance ${confidencePct}%` : ""}`,
    metadata: [
      { label: "Modèle IA", value: attempt.agentModel },
      ...(confidencePct != null ? [{ label: "Confiance", value: `${confidencePct}%` }] : []),
      ...(filesStr ? [{ label: "Fichiers modifiés", value: filesStr }] : []),
    ],
    body,
    ctaUrl: attempt.prUrl,
    ctaLabel: "Voir la PR GitHub",
  });

  const subject = `[PR à merger] ${bug.title}`;
  return sendEmail(notifyEmail(), subject, html, {
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
    return `<li style="margin:5px 0;font-size:13px;color:#334155;">
      <a href="${base}/admin/bugs/${b.id}" style="color:#2563eb;text-decoration:none;font-weight:500;">${escapeHtml(b.title)}</a>
      <span style="color:#94a3b8;font-size:11px;"> · ${SEVERITY_LABEL[b.severity] ?? b.severity}${rep ? ` · ${escapeHtml(`${rep.firstName} ${rep.lastName}`)}` : ""}</span>
    </li>`;
  }

  function sectionHeader(label: string, count: number, color: string): string {
    return `<div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.6px;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">${escapeHtml(label)} (${count})</div>`;
  }

  const sections: string[] = [];

  if (fixProposed.length > 0) {
    sections.push(`${sectionHeader("PRs en attente de merge", fixProposed.length, "#4f46e5")}
<ul style="margin:0;list-style:none;padding:0;">
  ${fixProposed.map((b) => {
    const pr = b.fixAttempts[0];
    const pct = pr?.confidence != null ? Math.round(pr.confidence * 100) : null;
    return `<li style="margin:6px 0;font-size:13px;color:#334155;">
      <a href="${pr?.prUrl ?? `${base}/admin/bugs/${b.id}`}" style="color:#4f46e5;text-decoration:none;font-weight:600;">${escapeHtml(b.title)}</a>
      ${pct != null ? `<span style="color:#94a3b8;font-size:11px;"> · confiance ${pct}%</span>` : ""}
    </li>`;
  }).join("")}
</ul>`);
  }

  if (newBugs.length > 0) {
    sections.push(`${sectionHeader("Nouveaux bugs aujourd'hui", newBugs.length, "#0f172a")}
<ul style="margin:0;list-style:disc;padding-left:18px;">${newBugs.map(bugLine).join("")}</ul>`);
  }

  if (fixedBugs.length > 0) {
    sections.push(`${sectionHeader("Bugs résolus", fixedBugs.length, "#059669")}
<ul style="margin:0;list-style:disc;padding-left:18px;">
  ${fixedBugs.map((b) => `<li style="margin:5px 0;font-size:13px;color:#334155;">${escapeHtml(b.title)}</li>`).join("")}
</ul>`);
  }

  if (pendingApproval.length > 0) {
    sections.push(`${sectionHeader("En attente de triage", pendingApproval.length, "#d97706")}
<ul style="margin:0;list-style:disc;padding-left:18px;">
  ${pendingApproval.slice(0, 8).map(bugLine).join("")}
  ${pendingApproval.length > 8 ? `<li style="color:#94a3b8;font-size:11px;margin:5px 0;">… et ${pendingApproval.length - 8} autres</li>` : ""}
</ul>`);
  }

  if (runningAttempts.length > 0) {
    sections.push(`${sectionHeader("Fixes en cours cette nuit", runningAttempts.length, "#0891b2")}
<ul style="margin:0;list-style:disc;padding-left:18px;">
  ${runningAttempts.map((a) => `<li style="margin:5px 0;font-size:13px;color:#334155;">${escapeHtml(a.bug.title)} <span style="color:#94a3b8;font-size:11px;">· ${escapeHtml(a.agentModel)}</span></li>`).join("")}
</ul>`);
  }

  const today = new Date().toLocaleDateString("fr-CA");

  const html = buildNexusEmail({
    event: "bug_daily_digest",
    preheader: `${newBugs.length} nouveau(x) · ${fixedBugs.length} réglé(s) · ${fixProposed.length} PR à merger`,
    title: `Résumé quotidien — ${today}`,
    intro: `${newBugs.length} nouveau(x) bug(s) · ${fixedBugs.length} réglé(s) · ${fixProposed.length} PR prête(s) à merger`,
    body: sections.join(""),
    ctaUrl: `${base}/admin/bugs`,
    ctaLabel: "Ouvrir le dashboard",
  });

  const subject = `[Bugs] Résumé ${today} — ${newBugs.length} nouveau(x), ${fixedBugs.length} fixé(s), ${fixProposed.length} PR à merger`;
  const ok = await sendEmail(notifyEmail(), subject, html, {
    from: { name: "Nexus Bugs", email: notifyEmail() },
  });
  return { sent: ok };
}
