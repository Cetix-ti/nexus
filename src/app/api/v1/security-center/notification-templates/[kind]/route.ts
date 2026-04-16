// ============================================================================
// GET /api/v1/security-center/notification-templates/:kind
// PUT /api/v1/security-center/notification-templates/:kind
//
// Permet d'éditer le HTML/subject/destinataires de l'email d'alerte.
// Si le template n'existe pas encore, GET le seed avec la valeur par défaut.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  DEFAULT_PERSISTENCE_HTML,
  DEFAULT_PERSISTENCE_SUBJECT,
  DEFAULT_PERSISTENCE_TEXT,
  DEFAULT_PERSISTENCE_RECIPIENTS,
} from "@/lib/security-center/persistence/default-template";

// Chaque kind a ses propres défauts (pour l'instant, seul persistence_tool).
function getDefaults(kind: string) {
  if (kind === "persistence_tool") {
    return {
      kind,
      enabled: true,
      recipients: DEFAULT_PERSISTENCE_RECIPIENTS,
      subject: DEFAULT_PERSISTENCE_SUBJECT,
      htmlBody: DEFAULT_PERSISTENCE_HTML,
      textBody: DEFAULT_PERSISTENCE_TEXT,
    };
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind } = await params;
  const existing = await prisma.securityNotificationTemplate.findUnique({
    where: { kind },
  });
  if (existing) return NextResponse.json({ template: existing });

  // Seed si défaut disponible, sinon 404.
  const defaults = getDefaults(kind);
  if (!defaults) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  const seeded = await prisma.securityNotificationTemplate.create({ data: defaults });
  return NextResponse.json({ template: seeded });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind } = await params;
  const body = (await req.json().catch(() => null)) as
    | {
        enabled?: boolean;
        recipients?: string[];
        subject?: string;
        htmlBody?: string;
        textBody?: string | null;
        resetToDefault?: boolean;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // Reset
  if (body.resetToDefault) {
    const defaults = getDefaults(kind);
    if (!defaults) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
    const upserted = await prisma.securityNotificationTemplate.upsert({
      where: { kind },
      create: defaults,
      update: {
        enabled: defaults.enabled,
        recipients: defaults.recipients,
        subject: defaults.subject,
        htmlBody: defaults.htmlBody,
        textBody: defaults.textBody,
      },
    });
    return NextResponse.json({ template: upserted });
  }

  // Update partiel
  const recipients = Array.isArray(body.recipients)
    ? body.recipients
        .map((r) => String(r).trim())
        .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))
    : undefined;

  const defaults = getDefaults(kind);
  const upserted = await prisma.securityNotificationTemplate.upsert({
    where: { kind },
    create: {
      kind,
      enabled: body.enabled ?? defaults?.enabled ?? true,
      recipients: recipients ?? defaults?.recipients ?? [],
      subject: body.subject ?? defaults?.subject ?? "",
      htmlBody: body.htmlBody ?? defaults?.htmlBody ?? "",
      textBody: body.textBody ?? defaults?.textBody ?? null,
    },
    update: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(recipients !== undefined ? { recipients } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.htmlBody !== undefined ? { htmlBody: body.htmlBody } : {}),
      ...(body.textBody !== undefined ? { textBody: body.textBody } : {}),
    },
  });
  return NextResponse.json({ template: upserted });
}
