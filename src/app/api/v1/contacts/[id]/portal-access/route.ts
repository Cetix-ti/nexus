import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await prisma.portalAccessUser.findUnique({
    where: { contactId: id },
  });

  if (!access) {
    return NextResponse.json(null);
  }

  return NextResponse.json(access);
}
