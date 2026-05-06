import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  purgeAgents,
  resolveAlertEmails,
  AteraPurgeAlreadyRunningError,
  type LinkedAssetAction,
} from "@/lib/integrations/atera-purge";
import { sendEmail } from "@/lib/email/send";

const bodySchema = z.object({
  agentIds: z.array(z.number().int().positive()).min(1).max(500),
  reason: z.string().min(20).max(2000),
  linkedAssetAction: z
    .enum(["archive", "keep", "delete"])
    .default("archive") satisfies z.ZodType<LinkedAssetAction>,
});

/**
 * POST /api/v1/integrations/atera/purge
 *
 * Body : { agentIds: number[], reason: string, linkedAssetAction? }
 *
 * Effectue la purge réelle :
 *   1. Pour chaque AgentID : DELETE Atera + action sur asset Nexus
 *   2. Crée un AteraPurgeLog par agent (status ok / error / skipped_*)
 *   3. Envoie un email récap aux destinataires configurés (asynchrone)
 *
 * RBAC : super-admin uniquement.
 *
 * Réponse : { success, data: PurgeResult }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { agentIds, reason, linkedAssetAction } = parsed.data;
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  let result;
  try {
    result = await purgeAgents({
      agentIds,
      actorUserId: me.id,
      reason,
      linkedAssetAction,
      ipAddress,
      userAgent,
    });
  } catch (e) {
    if (e instanceof AteraPurgeAlreadyRunningError) {
      return NextResponse.json(
        { success: false, error: e.message, code: "PURGE_ALREADY_RUNNING" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }

  console.info(
    `[atera-purge] batch=${result.batchId} actor=${me.email} requested=${result.totalRequested} ok=${result.okCount} err=${result.errorCount} skip=${result.skippedCount}`
  );

  // Email récap (best-effort — n'échoue pas la requête si l'email plante,
  // mais log les erreurs pour traçabilité).
  resolveAlertEmails()
    .then(async (emails) => {
      if (emails.length === 0) {
        console.warn(
          `[atera-purge] batch=${result.batchId} aucun destinataire d'alerte (config + fallback super-admins vide)`
        );
        return;
      }
      const subject = `Nexus — Purge Atera : ${result.okCount} actifs supprimés`;
      const html = `
        <h2>Purge Atera terminée</h2>
        <p><strong>Acteur :</strong> ${me.firstName} ${me.lastName} (${me.email})</p>
        <p><strong>Batch :</strong> ${result.batchId}</p>
        <p><strong>Action sur assets Nexus :</strong> ${linkedAssetAction}</p>
        <p><strong>Raison :</strong> ${escapeHtml(reason)}</p>
        <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
          <tr><td>Demandés</td><td><strong>${result.totalRequested}</strong></td></tr>
          <tr><td>Supprimés OK</td><td><strong style="color:#16a34a">${result.okCount}</strong></td></tr>
          <tr><td>Erreurs</td><td><strong style="color:#dc2626">${result.errorCount}</strong></td></tr>
          <tr><td>Skippés</td><td><strong style="color:#ca8a04">${result.skippedCount}</strong></td></tr>
        </table>
        <p style="margin-top:16px"><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/settings?section=atera_maintenance">Voir l'historique dans Nexus</a></p>
      `;
      for (const to of emails) {
        await sendEmail(to, subject, html).catch((emailErr) => {
          console.error(
            `[atera-purge] échec envoi email à ${to}:`,
            emailErr instanceof Error ? emailErr.message : emailErr
          );
        });
      }
    })
    .catch((resolveErr) => {
      console.error(
        `[atera-purge] échec résolution destinataires:`,
        resolveErr instanceof Error ? resolveErr.message : resolveErr
      );
    });

  return NextResponse.json({ success: true, data: result });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
