// ============================================================================
// BITDEFENDER GRAVITYZONE — Webhook de push event
//
// Architecture :
//   GravityZone --POST JSON-RPC--> Nexus /webhook
//                                      │
//                                      ├─> decode + ingestSecurityAlert
//                                      └─> forward optionnel à n8n
//
// Sécurité : Bitdefender envoie en header `Authorization: <secret>` la
// valeur configurée via setPushEventSettings. Nexus valide cette valeur
// contre BITDEFENDER_WEBHOOK_SECRET (env). Mismatch → 401 et l'event
// n'est ni ingéré ni forwardé (la tentative est loggée pour audit).
//
// Format payload Bitdefender (JSON-RPC 2.0) :
//   { "jsonrpc": "2.0", "method": "pushEvent",
//     "params": { "events": [ {event1}, {event2}, ... ],
//                 "callbackData": "..." } }
//
// Certaines versions envoient `params.event` (singulier) au lieu de
// `params.events` — on tolère les deux.
//
// Réponse : toujours renvoyer HTTP 200 avec {jsonrpc: "2.0", result: ...}
// rapidement. Le décodage et le forward sont faits en best-effort, les
// erreurs ne remontent pas à Bitdefender (qui re-tenterait sinon toute
// la nuit).
// ============================================================================

import { NextResponse } from "next/server";
import { decodeBitdefenderEvent, type BitdefenderEvent } from "@/lib/security-center/decoders/bitdefender";
import { ingestSecurityAlert } from "@/lib/security-center/correlator";

/** Normalise les headers en tableau pour logging (masque Authorization). */
function headersForLog(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = k.toLowerCase() === "authorization" ? "***" : v;
  });
  return out;
}

/**
 * Forward la requête originale à n8n (ou autre downstream).
 * Fire-and-forget — n'attend pas la réponse, n'empêche jamais l'ACK
 * à Bitdefender. Timeout court pour ne pas tenir de connexion ouverte
 * si n8n est lent.
 */
async function forwardToDownstream(
  rawBody: string,
  headers: Headers,
  forwardUrl: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": headers.get("content-type") ?? "application/json",
        // On passe l'Authorization tel quel : n8n peut valider s'il veut
        // (typiquement non — webhook node n8n accepte tout).
        ...(headers.get("authorization")
          ? { Authorization: headers.get("authorization")! }
          : {}),
      },
      body: rawBody,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[bitdefender-webhook] forward ${forwardUrl} → HTTP ${res.status}`,
      );
    }
  } catch (e) {
    console.warn(
      `[bitdefender-webhook] forward ${forwardUrl} échoué :`,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  // 1. Validation du secret partagé. On lit le header Authorization
  //    tel que Bitdefender l'envoie (valeur configurée via
  //    setPushEventSettings.authorization).
  const expectedSecret = process.env.BITDEFENDER_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    console.error(
      "[bitdefender-webhook] BITDEFENDER_WEBHOOK_SECRET non configuré — requêtes rejetées. " +
        "Exécute scripts/bitdefender-register-webhook.ts pour setup.",
    );
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Webhook not configured" } },
      { status: 503 },
    );
  }
  const received = req.headers.get("authorization")?.trim();
  if (!received || received !== expectedSecret) {
    console.warn(
      "[bitdefender-webhook] Auth invalide :",
      JSON.stringify(headersForLog(req.headers)).slice(0, 300),
    );
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Unauthorized" } },
      { status: 401 },
    );
  }

  // 2. Lecture brute du body — on le garde sous cette forme pour le
  //    forward downstream (byte-for-byte identique à l'original).
  const rawBody = await req.text();
  let payload: {
    jsonrpc?: string;
    method?: string;
    params?: { events?: BitdefenderEvent[]; event?: BitdefenderEvent; callbackData?: string };
    id?: string | number;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  // 3. Ingestion — certaines versions groupent en params.events[],
  //    d'autres envoient un seul params.event. On accepte les deux.
  const events: BitdefenderEvent[] = Array.isArray(payload.params?.events)
    ? payload.params.events
    : payload.params?.event
      ? [payload.params.event]
      : [];

  let ingested = 0;
  let skipped = 0;
  for (const ev of events) {
    try {
      const decoded = await decodeBitdefenderEvent(ev);
      if (!decoded) {
        skipped++;
        continue;
      }
      const res = await ingestSecurityAlert(decoded);
      if (res?.isNew) ingested++;
      else skipped++;
    } catch (e) {
      console.error("[bitdefender-webhook] ingest échoué pour un event :", e);
      skipped++;
    }
  }

  // 4. Forward downstream (n8n) en fire-and-forget. Pas d'await
  //    pour que Bitdefender reçoive son 200 dans < 1s.
  const forwardUrl = process.env.BITDEFENDER_WEBHOOK_FORWARD_URL?.trim();
  if (forwardUrl) {
    forwardToDownstream(rawBody, req.headers, forwardUrl).catch(() => {
      /* déjà logué dans la fonction */
    });
  }

  // 5. Réponse JSON-RPC valide pour que Bitdefender considère le push
  //    réussi (sinon il re-tenterait toutes les 30s pendant 24h).
  if (events.length > 0) {
    console.log(
      `[bitdefender-webhook] ${events.length} event(s) reçu(s), ${ingested} ingéré(s), ${skipped} ignoré(s)` +
        (forwardUrl ? ` · forwardé à ${forwardUrl}` : ""),
    );
  }
  return NextResponse.json({ jsonrpc: "2.0", result: true, id: payload.id ?? null });
}

// GET pour tester depuis un navigateur / curl — retourne juste un
// indicateur "webhook vivant".
export async function GET() {
  const hasSecret = !!process.env.BITDEFENDER_WEBHOOK_SECRET?.trim();
  const forward = process.env.BITDEFENDER_WEBHOOK_FORWARD_URL?.trim() || null;
  return NextResponse.json({
    endpoint: "bitdefender-webhook",
    ready: hasSecret,
    forwardUrl: forward,
    hint: hasSecret
      ? "Webhook prêt à recevoir. Configure Bitdefender GZ pour poster ici."
      : "Lancer scripts/bitdefender-register-webhook.ts pour initialiser.",
  });
}
