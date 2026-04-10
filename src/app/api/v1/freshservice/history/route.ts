import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getImportHistory } from "@/lib/freshservice/storage";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Authentification requise" },
      { status: 401 }
    );
  }
  const role = (session.user as any).role;
  if (role !== "SUPER_ADMIN" && role !== "MSP_ADMIN") {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }
  const history = await getImportHistory();
  return NextResponse.json({ success: true, data: history });
}
