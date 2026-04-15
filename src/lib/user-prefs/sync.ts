"use client";

/**
 * Synchronisation transparente de certaines clés localStorage avec
 * `user.preferences` (JSON field, persisté en DB via /api/v1/me PATCH).
 *
 * Pourquoi : les pages analytics (dashboards, reports, widgets, data) et
 * le dashboard principal stockent leurs layouts/favoris/widgets custom en
 * localStorage. Résultat : perte de tout au changement d'appareil, à la
 * déconnexion ou au nettoyage du cache.
 *
 * Ce module :
 *   1. Au démarrage, pull les prefs serveur et restaure dans localStorage
 *      les clés `nexus:*` manquantes ou plus anciennes (migration one-way
 *      serveur → local).
 *   2. À chaque changement d'une clé `nexus:*`, envoie un PATCH debouncé
 *      vers /api/v1/me avec `preferences.localMirror` = snapshot.
 *
 * Les pages existantes n'ont AUCUN changement à faire — elles continuent
 * d'utiliser `localStorage.getItem/setItem`. Le sync se fait en arrière-plan.
 */

const MIRROR_KEY = "localMirror";
const KEY_PREFIXES = ["nexus:", "analytics:"] as const;
const DEBOUNCE_MS = 1500;

let initialized = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function isSyncableKey(k: string | null | undefined): boolean {
  if (!k) return false;
  return KEY_PREFIXES.some((p) => k.startsWith(p));
}

function collectLocalSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!isSyncableKey(k)) continue;
    const v = localStorage.getItem(k!);
    if (v !== null) out[k!] = v;
  }
  return out;
}

async function pushSnapshot() {
  try {
    const snapshot = collectLocalSnapshot();
    await fetch("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: { [MIRROR_KEY]: { updatedAt: Date.now(), entries: snapshot } },
      }),
    });
  } catch {
    // Échec silencieux — on retente au prochain changement.
  }
}

function schedulePush() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void pushSnapshot();
  }, DEBOUNCE_MS);
}

async function pullAndRestore() {
  try {
    const res = await fetch("/api/v1/me");
    if (!res.ok) return;
    const me = await res.json();
    const mirror = me?.preferences?.[MIRROR_KEY];
    if (!mirror || typeof mirror !== "object") return;
    const entries = mirror.entries as Record<string, string> | undefined;
    if (!entries) return;

    // Restore missing keys. Ne pas écraser l'existant — le localStorage
    // local a priorité si l'utilisateur vient de modifier quelque chose.
    // On pousse ensuite un snapshot fusionné pour que le serveur soit à jour.
    let restored = 0;
    for (const [k, v] of Object.entries(entries)) {
      if (!isSyncableKey(k)) continue;
      if (localStorage.getItem(k) === null) {
        localStorage.setItem(k, v);
        restored++;
      }
    }
    if (restored > 0) {
      // Si on a restauré des clés, pousse le snapshot enrichi.
      schedulePush();
    }
  } catch {
    // Pas de session, réseau indisponible, etc. — on ignore.
  }
}

function patchStorageMethods() {
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  const origClear = Storage.prototype.clear;

  Storage.prototype.setItem = function (k: string, v: string) {
    origSet.call(this, k, v);
    if (this === window.localStorage && isSyncableKey(k)) schedulePush();
  };
  Storage.prototype.removeItem = function (k: string) {
    origRemove.call(this, k);
    if (this === window.localStorage && isSyncableKey(k)) schedulePush();
  };
  Storage.prototype.clear = function () {
    origClear.call(this);
    if (this === window.localStorage) schedulePush();
  };
}

export function initUserPrefsSync() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  patchStorageMethods();
  void pullAndRestore();

  // Force un dernier push au déchargement pour ne rien perdre.
  window.addEventListener("beforeunload", () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      // sendBeacon pour un envoi fiable même pendant navigation.
      try {
        const snapshot = collectLocalSnapshot();
        const blob = new Blob(
          [
            JSON.stringify({
              preferences: {
                [MIRROR_KEY]: { updatedAt: Date.now(), entries: snapshot },
              },
            }),
          ],
          { type: "application/json" },
        );
        navigator.sendBeacon?.("/api/v1/me", blob);
      } catch {
        /* ignore */
      }
    }
  });
}
