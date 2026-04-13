import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

// GET — list notifications for the current user
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      userId: me.id,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: me.id, isRead: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH — mark notifications as read
export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: me.id, isRead: false },
      data: { isRead: true },
    });
  } else if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: me.id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
