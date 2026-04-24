import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole, type UserRole } from "@/lib/auth-utils";
import { optimizeToDataUri, PRESET_AVATAR } from "@/lib/images/optimize";

const ROLE_VALUES = [
  "SUPER_ADMIN",
  "MSP_ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "CLIENT_ADMIN",
  "CLIENT_USER",
  "READ_ONLY",
] as const;

const userCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(ROLE_VALUES),
  phone: z.string().max(50).optional().nullable(),
  password: z.string().min(8).max(200).optional(),
  isActive: z.boolean().optional(),
});

const userUpdateSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    // `role` accepte une valeur système (ROLE_VALUES) OU une clé de
    // CustomRole. Validation fine dans le handler (lookup Prisma).
    role: z.string().max(50).optional(),
    phone: z.string().max(50).optional().nullable(),
    password: z.string().min(8).max(200).optional(),
    isActive: z.boolean().optional(),
    mileageAllocationEnabled: z.boolean().optional(),
    // Data URI base64 (image/*) ou null pour supprimer.
    // Limite ~700 Ko encodé (~512 Ko binaire).
    avatar: z.string().max(700_000).nullable().optional(),
    signature: z.string().max(5000).nullable().optional(),
    signatureHtml: z.string().max(20000).nullable().optional(),
    capabilities: z.array(z.string().max(50)).optional(),
  })
  .refine((d) => Object.keys(d).length > 1, {
    message: "no fields to update",
  });

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function serializeUser(u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  customRoleKey?: string | null;
  avatar: string | null;
  phone: string | null;
  isActive: boolean;
  capabilities: string[];
  lastLoginAt: Date | null;
  signature?: string | null;
  signatureHtml?: string | null;
}) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    name: `${u.firstName} ${u.lastName}`.trim(),
    role: u.role,
    customRoleKey: u.customRoleKey ?? null,
    // "effectiveRole" = la clé que l'UI expose dans le dropdown :
    // rôle custom si assigné, sinon rôle système.
    effectiveRole: u.customRoleKey ?? u.role,
    avatar: u.avatar,
    phone: u.phone,
    isActive: u.isActive,
    capabilities: u.capabilities ?? [],
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    signature: u.signature ?? null,
    signatureHtml: u.signatureHtml ?? null,
  };
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  // Listing users is staff-only — clients must never see other tenants' users.
  if (!hasMinimumRole(me.role, "READ_ONLY") || me.role.startsWith("CLIENT_")) {
    return forbidden();
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const includeSystem = url.searchParams.get("includeSystem") === "true";

  // Lightweight list — exclude heavy fields (avatar, signature*)
  // to keep the payload small. Opt-in via query params for pages that need them.
  const includeAvatar = url.searchParams.get("includeAvatar") === "true";
  const includeSignature = url.searchParams.get("includeSignature") === "true";
  const users = await prisma.user.findMany({
    where: {
      ...(role
        ? { role: { in: role.split(",") as UserRole[] } }
        : { role: { not: "CLIENT_USER" } }),
      ...(includeInactive ? {} : { isActive: true }),
      ...(includeSystem
        ? {}
        : { email: { not: "freshservice-import@cetix.ca" } }),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      customRoleKey: true,
      phone: true,
      isActive: true,
      mileageAllocationEnabled: true,
      capabilities: true,
      lastLoginAt: true,
      ...(includeAvatar ? { avatar: true } : {}),
      ...(includeSignature ? { signature: true, signatureHtml: true } : {}),
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
      customRoleKey: (u as any).customRoleKey ?? null,
      effectiveRole: (u as any).customRoleKey ?? u.role,
      avatar: (u as any).avatar ?? null,
      phone: u.phone,
      isActive: u.isActive,
      mileageAllocationEnabled: (u as any).mileageAllocationEnabled !== false,
      capabilities: (u as any).capabilities ?? [],
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ...(includeSignature
        ? {
            signature: (u as any).signature ?? null,
            signatureHtml: (u as any).signatureHtml ?? null,
          }
        : {}),
    })),
  );
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  try {
    const created = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        phone: data.phone ?? null,
        isActive: data.isActive ?? true,
        passwordHash: data.password
          ? await bcrypt.hash(data.password, 12)
          : null,
      },
    });
    return NextResponse.json(serializeUser(created), { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }
    console.error("user create failed", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Optimize a data URI avatar image to WebP 192px max. */
async function optimizeAvatar(dataUri: string): Promise<string> {
  // Extract base64 from data URI
  const match = dataUri.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match) return dataUri; // Not a data URI, return as-is
  try {
    const buf = Buffer.from(match[1], "base64");
    const result = await optimizeToDataUri(buf, PRESET_AVATAR);
    return result.dataUri;
  } catch {
    return dataUri; // Optimization failed, keep original
  }
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  // Users may edit themselves; admins may edit anyone.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { id, password, role, isActive, email, avatar, capabilities, mileageAllocationEnabled, ...rest } = parsed.data;
  const isSelf = id === me.id;
  const isAdmin = hasMinimumRole(me.role, "MSP_ADMIN");
  if (!isSelf && !isAdmin) return forbidden();
  // Only admins can change role / activation / email / capabilities /
  // allocation km (affecte la paie — pas de self-edit possible).
  if ((role !== undefined || isActive !== undefined || capabilities !== undefined || mileageAllocationEnabled !== undefined) && !isAdmin) {
    return forbidden();
  }

  // Dispatch role système vs rôle custom. Si `role` est une valeur de
  // UserRole enum, on l'écrit direct + reset customRoleKey. Sinon on
  // lookup CustomRole, écrit role=parentRole (fallback TECHNICIAN) et
  // customRoleKey=key. Permet au dropdown de mélanger les deux types.
  let roleWrite: UserRole | undefined;
  let customRoleKeyWrite: string | null | undefined;
  if (role !== undefined) {
    if ((ROLE_VALUES as readonly string[]).includes(role)) {
      roleWrite = role as UserRole;
      customRoleKeyWrite = null; // reset override
    } else {
      const custom = await prisma.customRole.findUnique({
        where: { key: role },
        select: { key: true, parentRole: true },
      });
      if (!custom) {
        return NextResponse.json({ error: `Rôle « ${role} » inconnu` }, { status: 400 });
      }
      roleWrite = (custom.parentRole ?? "TECHNICIAN") as UserRole;
      customRoleKeyWrite = custom.key;
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(email !== undefined ? { email: email.toLowerCase() } : {}),
        ...(roleWrite !== undefined ? { role: roleWrite } : {}),
        ...(customRoleKeyWrite !== undefined ? { customRoleKey: customRoleKeyWrite } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(mileageAllocationEnabled !== undefined ? { mileageAllocationEnabled } : {}),
        ...(capabilities !== undefined ? { capabilities } : {}),
        ...(avatar !== undefined ? { avatar: avatar ? await optimizeAvatar(avatar) : null } : {}),
        ...(password
          ? { passwordHash: await bcrypt.hash(password, 12) }
          : {}),
      },
    });
    return NextResponse.json(serializeUser(updated));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 409 }
        );
      if (e.code === "P2025")
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("user update failed", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (id === me.id) {
    return NextResponse.json(
      { error: "Cannot deactivate yourself" },
      { status: 400 }
    );
  }
  try {
    // Soft delete: deactivate rather than destroy ticket history.
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json(serializeUser(updated));
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("user delete failed", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
