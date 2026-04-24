// Liste des fournisseurs ISP — autocomplete dans le formulaire de lien Internet
// d'une organisation. Stocké dans TenantSetting (KV).
//
// Lecture : tout user authentifié (utilisé pour l'autocomplete).
// Écriture : SUPER_ADMIN uniquement.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const KEY = "network.isp_providers";
const DEFAULTS = ["Bell", "Vidéotron", "TELUS", "Cogeco", "Rogers", "Distributel"];

function normalize(s: string): string { return s.trim().replace(/\s+/g, " "); }

async function loadList(): Promise<string[]> {
  const row = await prisma.tenantSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULTS;
  const v = row.value as unknown as { providers?: unknown };
  if (!Array.isArray(v?.providers)) return DEFAULTS;
  return v.providers.filter((p): p is string => typeof p === "string");
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ providers: await loadList() });
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.providers) ? body.providers : null;
  if (!raw) return NextResponse.json({ error: "providers[] requis" }, { status: 400 });

  // Normalise + dédup (case-insensitive), tri alphabétique, cap à 100.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const n = normalize(r);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(n);
  }
  cleaned.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const final = cleaned.slice(0, 100);

  await prisma.tenantSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: { providers: final } as never },
    update: { value: { providers: final } as never },
  });
  return NextResponse.json({ providers: final });
}
