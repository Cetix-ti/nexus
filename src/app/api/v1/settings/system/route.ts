import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import os from "os";

/**
 * GET /api/v1/settings/system
 * Returns system information including reverse proxy detection.
 * Admin-only endpoint.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Detect reverse proxy from request headers
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const xRealIp = req.headers.get("x-real-ip");
  const xForwardedProto = req.headers.get("x-forwarded-proto");
  const xForwardedHost = req.headers.get("x-forwarded-host");
  const via = req.headers.get("via");
  const host = req.headers.get("host");

  const isProxied = !!(xForwardedFor || xRealIp || xForwardedProto === "https" || via);

  // Detect proxy IP (the proxy's address is typically the first hop)
  let proxyIp: string | null = null;
  if (xForwardedFor) {
    // x-forwarded-for: client, proxy1, proxy2 — last entry before server is the proxy
    const parts = xForwardedFor.split(",").map((s) => s.trim());
    if (parts.length >= 1) {
      proxyIp = parts[parts.length - 1]; // Last hop = reverse proxy
      if (parts.length === 1) proxyIp = parts[0]; // Single hop = proxy forwarded client IP
    }
  }
  if (!proxyIp && xRealIp) proxyIp = xRealIp;

  // Server info
  const serverHostname = os.hostname();
  const serverIps = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);

  const publicUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || `http://${host}`;

  return NextResponse.json({
    success: true,
    data: {
      server: {
        hostname: serverHostname,
        internalIps: serverIps,
        nodeVersion: process.version,
        platform: os.platform(),
        uptime: Math.round(os.uptime()),
        memoryUsage: {
          total: Math.round(os.totalmem() / 1024 / 1024),
          free: Math.round(os.freemem() / 1024 / 1024),
          used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
        },
      },
      network: {
        publicUrl,
        host,
        isProxied,
        proxy: isProxied
          ? {
              detected: true,
              ip: proxyIp,
              protocol: xForwardedProto || "http",
              forwardedFor: xForwardedFor,
              realIp: xRealIp,
              forwardedHost: xForwardedHost,
              via: via,
            }
          : { detected: false },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        authUrl: process.env.AUTH_URL ? "(configuré)" : "(non configuré)",
        databaseConnected: true, // If this endpoint responds, DB is connected
      },
    },
  });
}
