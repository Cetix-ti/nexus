import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { runWeeklyDigest, sendWeeklyDigestForUser } from "@/lib/notifications/weekly-digest";
import prisma from "@/lib/prisma";

/**
 * POST /api/v1/notifications/weekly-digest/run
 *
 * Déclenche manuellement l'envoi du weekly_digest. Restreint aux admins
 * (SUPER_ADMIN / MSP_ADMIN) pour éviter qu'un agent quelconque spamme
 * l'ensemble des destinataires en cliquant le bouton.
 *
 * Body :
 *   - `mode`: "all" (défaut) → respecte WEEKLY_DIGEST_ALLOWED_FIRST_NAMES,
 *             envoie à tous les agents autorisés. C'est ce que fait le
 *             cron du vendredi 17h.
 *   - `mode`: "self" → envoie le digest UNIQUEMENT à l'admin courant,
 *             utile pour itérer sur le contenu sans spammer Bruno+Simon.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { mode?: "all" | "self" };
  const mode = body.mode === "self" ? "self" : "all";

  if (mode === "self") {
    // Vérifie que l'utilisateur courant est bien actif puis envoie un
    // digest "test" à lui-même sur la fenêtre 7 jours glissants.
    const u = await prisma.user.findUnique({
      where: { id: me.id },
      select: { id: true, isActive: true, firstName: true, lastName: true },
    });
    if (!u?.isActive) {
      return NextResponse.json({ error: "User inactive" }, { status: 400 });
    }
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 3600_000);
    await sendWeeklyDigestForUser(u.id, since, now);
    return NextResponse.json({
      ok: true,
      mode,
      sent: [`${u.firstName} ${u.lastName}`],
    });
  }

  const res = await runWeeklyDigest();
  return NextResponse.json({ ok: true, mode, ...res });
}
