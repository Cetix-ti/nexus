import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewFreshserviceZip } from "@/lib/freshservice/parser";

export const maxDuration = 60; // longer timeout for big zips

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as any).role;
  if (role !== "SUPER_ADMIN" && role !== "MSP_ADMIN") return null;
  return session.user;
}

/**
 * POST /api/v1/freshservice/preview
 * Multipart form-data with field "file" = the .zip
 * Returns a quick summary of what's in the file before the user confirms.
 */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Fichier manquant" },
      { status: 400 }
    );
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json(
      { success: false, error: "Le fichier doit être un .zip" },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const preview = await previewFreshserviceZip(buf);
    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        fileSizeMb: Math.round((file.size / (1024 * 1024)) * 10) / 10,
        ...preview,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Erreur de lecture du ZIP",
      },
      { status: 500 }
    );
  }
}
