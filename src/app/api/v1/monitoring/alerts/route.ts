import { NextResponse } from "next/server";
import type { MonitoringAlertStage } from "@prisma/client";
import { listAlerts, stageCounts, updateAlertStage } from "@/lib/monitoring/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

const VALID_STAGES: MonitoringAlertStage[] = [
  "TRIAGE",
  "INVESTIGATING",
  "WAITING_PARTS",
  "WAITING_VENDOR",
  "WAITING_MAINTENANCE",
  "RESOLVED",
  "IGNORED",
];

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role.startsWith("CLIENT_")) return forbidden();

  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") as MonitoringAlertStage | null;
  const sourceId = url.searchParams.get("sourceId");
  const organizationId = url.searchParams.get("organizationId");
  const search = url.searchParams.get("search");
  const includeCounts = url.searchParams.get("counts") === "true";

  const [alerts, counts] = await Promise.all([
    listAlerts({
      stage: stage && VALID_STAGES.includes(stage) ? stage : null,
      sourceId,
      organizationId,
      search,
    }),
    includeCounts ? stageCounts() : Promise.resolve(null),
  ]);

  return NextResponse.json({ alerts, counts });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "TECHNICIAN")) return forbidden();

  let body: { id?: string; stage?: string; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!body.stage || !VALID_STAGES.includes(body.stage as MonitoringAlertStage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }
  await updateAlertStage(
    body.id,
    body.stage as MonitoringAlertStage,
    body.notes
  );
  return NextResponse.json({ ok: true });
}
