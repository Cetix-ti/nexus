import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { resolveAlertEmails } from "@/lib/integrations/atera-purge";

const recipientSchema = z
  .object({
    userId: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((r) => !!r.userId || !!r.email, {
    message: "userId ou email requis",
  });

const putSchema = z.object({
  recipients: z.array(recipientSchema).max(50),
});

/**
 * GET /api/v1/integrations/atera/alert-recipients
 *
 * Réponse : {
 *   recipients: AteraAlertRecipient[],
 *   resolvedEmails: string[]   // ce qui sera effectivement notifié
 * }
 *
 * `resolvedEmails` permet à l'UI d'afficher la liste réelle, fallback inclus
 * sur les super-admins quand aucun destinataire n'est explicitement configuré.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [recipients, resolvedEmails] = await Promise.all([
    prisma.ateraAlertRecipient.findMany({
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    resolveAlertEmails(),
  ]);

  return NextResponse.json({
    success: true,
    data: { recipients, resolvedEmails },
  });
}

/**
 * PUT /api/v1/integrations/atera/alert-recipients
 * Remplace toute la liste des destinataires (snapshot complet).
 */
export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const recipients = parsed.data.recipients;

  // Remplacement complet : on supprime tout et on recrée
  await prisma.$transaction([
    prisma.ateraAlertRecipient.deleteMany({}),
    ...recipients.map((r) =>
      prisma.ateraAlertRecipient.create({
        data: {
          userId: r.userId ?? null,
          email: r.email ?? null,
          enabled: r.enabled ?? true,
        },
      })
    ),
  ]);

  return NextResponse.json({ success: true });
}
