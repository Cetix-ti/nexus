// Bulk approve : passe tous les bugs NEW/TRIAGED/REJECTED en APPROVED_FOR_FIX.
// Staff uniquement.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.bugReport.updateMany({
    where: { status: { in: ["NEW", "TRIAGED", "REJECTED"] } },
    data: {
      status: "APPROVED_FOR_FIX",
      approvedForAutoFixAt: new Date(),
      approvedByUserId: me.id,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
    },
  });
  return NextResponse.json({ count: updated.count });
}
