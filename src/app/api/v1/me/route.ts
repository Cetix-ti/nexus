import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: me.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
        role: true,
        capabilities: true,
        preferences: true,
        mfaEnabled: true,
        signature: true,
        signatureHtml: true,
        // Phase 11D — niveau technicien pour auto-sélection du palier.
        level: true,
      },
    });

    // Capacités effectives = union des capacités personnelles (user.capabilities)
    // et des permissions accordées au rôle (me.rolePermissions). La vérif
    // serveur (hasCapability) fait déjà cette union ; le frontend doit avoir
    // la même vue pour que les gates côté client (ex. canFinances) soient
    // cohérents avec les guards API.
    const personalCaps: string[] = (user?.capabilities as string[] | null) ?? [];
    const effectiveCapabilities = [...new Set([...personalCaps, ...me.rolePermissions])];

    return NextResponse.json(
      user
        ? { ...user, effectiveCapabilities }
        : { id: me.id, avatar: null, preferences: null, mfaEnabled: false, signature: null, signatureHtml: null, effectiveCapabilities }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

/** PATCH — update user preferences (kanban column order, UI settings, etc.) */
export async function PATCH(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Merge with existing preferences
    const existing = await prisma.user.findUnique({
      where: { id: me.id },
      select: { preferences: true },
    });

    const currentPrefs = (existing?.preferences as Record<string, any>) ?? {};
    const merged = { ...currentPrefs, ...body.preferences };

    await prisma.user.update({
      where: { id: me.id },
      data: { preferences: merged },
    });

    return NextResponse.json({ success: true, preferences: merged });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
