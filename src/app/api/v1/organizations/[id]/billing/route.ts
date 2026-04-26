import { NextResponse, type NextRequest } from "next/server";
import { mockBillingProfiles } from "@/lib/billing/mock-data";
import { resolveClientBillingProfile } from "@/lib/billing/engine";
import {
  getClientBillingOverrideForOrg,
  upsertClientBillingOverride,
} from "@/lib/billing/overrides-db";
import type { ClientBillingOverride } from "@/lib/billing/types";
import { getCurrentUser } from "@/lib/auth-utils";

async function findBaseProfileForOrg(orgId: string) {
  const override = (await getClientBillingOverrideForOrg(orgId)) ?? undefined;
  const baseProfile =
    (override && mockBillingProfiles.find((p) => p.id === override.baseProfileId)) ||
    mockBillingProfiles.find((p) => p.isDefault) ||
    mockBillingProfiles[0];
  return { override, baseProfile };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { override, baseProfile } = await findBaseProfileForOrg(id);
    if (!baseProfile) {
      return NextResponse.json(
        { success: false, error: "Aucun profil de facturation disponible" },
        { status: 404 }
      );
    }
    const resolved = resolveClientBillingProfile(baseProfile, override);
    return NextResponse.json({
      success: true,
      data: {
        organizationId: id,
        baseProfile,
        override: override ?? null,
        resolved,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Échec de la récupération du profil de facturation" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<ClientBillingOverride>;
    const { baseProfile } = await findBaseProfileForOrg(id);
    if (!baseProfile) {
      return NextResponse.json(
        { success: false, error: "Profil de base introuvable" },
        { status: 404 }
      );
    }

    const updated = await upsertClientBillingOverride(id, {
      ...body,
      baseProfileId: body.baseProfileId ?? baseProfile.id,
    });

    const resolved = resolveClientBillingProfile(baseProfile, updated);
    return NextResponse.json({
      success: true,
      data: {
        organizationId: id,
        baseProfile,
        override: updated,
        resolved,
      },
    });
  } catch (e) {
    console.error("PATCH /organizations/[id]/billing error:", e);
    return NextResponse.json(
      { success: false, error: "Échec de la mise à jour du profil de facturation" },
      { status: 500 }
    );
  }
}
