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
        preferences: true,
        mfaEnabled: true,
      },
    });

    return NextResponse.json(user ?? { id: me.id, avatar: null, preferences: null, mfaEnabled: false });
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
