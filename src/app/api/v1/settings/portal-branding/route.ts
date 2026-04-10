import { NextResponse } from "next/server";
import { getPortalBranding, setSetting } from "@/lib/tenant-settings/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

const INLINE_LOGO_MAX_BYTES = 500 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/v1/settings/portal-branding
 * Public-ish: any authenticated user (incl. clients) can read the branding,
 * since it's used by the portal layout.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const branding = await getPortalBranding();
  return NextResponse.json(branding);
}

/**
 * PATCH /api/v1/settings/portal-branding
 * Body: { primaryColor?, companyName?, logo? (data URI) }
 * Admin only.
 */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();

  const ct = req.headers.get("content-type") || "";

  // ---- Multipart : upload du logo ----
  if (ct.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      fd = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const file = fd.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    const mime = (file.type || "image/png").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: `Type non supporté : ${mime}` },
        { status: 415 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > INLINE_LOGO_MAX_BYTES) {
      return NextResponse.json(
        { error: "Logo > 500 Ko (compresse l'image)" },
        { status: 413 }
      );
    }
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    const updated = await setSetting("portal.branding", { logo: dataUri });
    return NextResponse.json(updated);
  }

  // ---- JSON : color / companyName / logo cleared ----
  let body: { primaryColor?: string; companyName?: string; logo?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const patch: Partial<{
    primaryColor: string;
    companyName: string;
    logo: string | null;
  }> = {};
  if (body.primaryColor !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(body.primaryColor)) {
      return NextResponse.json(
        { error: "Couleur invalide (format #RRGGBB attendu)" },
        { status: 400 }
      );
    }
    patch.primaryColor = body.primaryColor.toUpperCase();
  }
  if (body.companyName !== undefined) {
    patch.companyName = body.companyName.slice(0, 100);
  }
  if (body.logo === null) {
    patch.logo = null;
  }
  const updated = await setSetting("portal.branding", patch);
  return NextResponse.json(updated);
}
