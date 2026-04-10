import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseFreshserviceZip } from "@/lib/freshservice/parser";
import { mapFreshserviceToNexus } from "@/lib/freshservice/mapper";
import {
  saveImportSnapshot,
  backupCurrentSnapshot,
  logImport,
  type ImportRecord,
} from "@/lib/freshservice/storage";

// Long-running endpoint
export const maxDuration = 600; // 10 minutes
export const dynamic = "force-dynamic";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as any).role;
  if (role !== "SUPER_ADMIN" && role !== "MSP_ADMIN") return null;
  return session.user;
}

/**
 * POST /api/v1/freshservice/import
 * Multipart form-data:
 *   - file: .zip
 *   - strategy: "overwrite" | "merge" (default: "overwrite")
 */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Accès refusé : super-admin requis" },
      { status: 403 }
    );
  }

  const start = Date.now();
  const formData = await request.formData();
  const file = formData.get("file");
  const strategy =
    (formData.get("strategy") as string) === "merge" ? "merge" : "overwrite";

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Fichier manquant" },
      { status: 400 }
    );
  }

  const fullName =
    `${(user as any).firstName ?? ""} ${(user as any).lastName ?? ""}`.trim() ||
    (user as any).email;

  // 1. Backup current state (before any destructive change)
  const backupFile = await backupCurrentSnapshot();

  try {
    // 2. Parse the ZIP
    const buf = Buffer.from(await file.arrayBuffer());
    const fsExport = await parseFreshserviceZip(buf);

    // 3. Map to Nexus shapes
    const result = mapFreshserviceToNexus(fsExport);

    // 4. Persist (overwrite mode = full replace; merge would be DB-only)
    await saveImportSnapshot(result);

    const ticketComments = result.tickets.reduce(
      (acc, t) => acc + (t.comments?.length || 0),
      0
    );

    const record: ImportRecord = {
      id: `imp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      startedBy: fullName,
      fileName: file.name,
      fileSizeBytes: file.size,
      strategy,
      durationMs: Date.now() - start,
      succeeded: true,
      organizations: result.organizations.length,
      contacts: result.contacts.length,
      agents: result.agents.length,
      queues: result.queues.length,
      tickets: result.tickets.length,
      ticketComments,
      assets: result.assets.length,
      kbArticles: result.kbArticles.length,
      warnings: result.warnings.length,
      backupFile: backupFile || undefined,
    };

    await logImport(record);

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        warnings: result.warnings.slice(0, 50),
        sample: {
          firstOrg: result.organizations[0]?.name,
          firstAgent: result.agents[0]?.fullName,
          firstTicket: result.tickets[0]?.subject,
          firstArticle: result.kbArticles[0]?.title,
        },
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Erreur d'import inconnue";

    await logImport({
      id: `imp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      startedBy: fullName,
      fileName: file.name,
      fileSizeBytes: file.size,
      strategy,
      durationMs: Date.now() - start,
      succeeded: false,
      errorMessage,
      organizations: 0,
      contacts: 0,
      agents: 0,
      queues: 0,
      tickets: 0,
      ticketComments: 0,
      assets: 0,
      kbArticles: 0,
      warnings: 0,
      backupFile: backupFile || undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        backupFile,
      },
      { status: 500 }
    );
  }
}
