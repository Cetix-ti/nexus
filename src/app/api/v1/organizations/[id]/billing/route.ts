import { NextResponse, type NextRequest } from "next/server";
import {
  mockBillingProfiles,
  mockClientBillingOverrides,
  getClientBillingOverride,
} from "@/lib/billing/mock-data";
import { resolveClientBillingProfile } from "@/lib/billing/engine";
import type { ClientBillingOverride } from "@/lib/billing/types";
import { getCurrentUser } from "@/lib/auth-utils";

function findBaseProfileForOrg(orgId: string) {
  const override = getClientBillingOverride(orgId);
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
    const { override, baseProfile } = findBaseProfileForOrg(id);
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
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<ClientBillingOverride>;
    const { baseProfile } = findBaseProfileForOrg(id);
    if (!baseProfile) {
      return NextResponse.json(
        { success: false, error: "Profil de base introuvable" },
        { status: 404 }
      );
    }

    const existingIdx = mockClientBillingOverrides.findIndex(
      (o) => o.organizationId === id
    );
    const nowIso = new Date().toISOString();

    let updated: ClientBillingOverride;
    if (existingIdx >= 0) {
      updated = {
        ...mockClientBillingOverrides[existingIdx],
        ...body,
        organizationId: id,
        updatedAt: nowIso,
      };
      mockClientBillingOverrides[existingIdx] = updated;
    } else {
      updated = {
        id: `cbo_${id}_${Date.now()}`,
        organizationId: id,
        organizationName: body.organizationName ?? id,
        baseProfileId: body.baseProfileId ?? baseProfile.id,
        isActive: body.isActive ?? true,
        effectiveFrom: body.effectiveFrom ?? nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...body,
      } as ClientBillingOverride;
      mockClientBillingOverrides.push(updated);
    }

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
  } catch {
    return NextResponse.json(
      { success: false, error: "Échec de la mise à jour du profil de facturation" },
      { status: 500 }
    );
  }
}
