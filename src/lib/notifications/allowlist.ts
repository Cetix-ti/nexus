// ============================================================================
// NOTIFICATION ALLOWLIST — dev-safety guard on contact-facing emails
//
// Freshservice écoute toujours billets@cetix.ca en parallèle de Nexus jusqu'à
// la mise en prod. Si Nexus envoie des courriels aux vrais contacts clients,
// ils reçoivent des messages en double et vont être très fâchés.
//
// Cette allowlist est une **porte stricte** : tant que le mode "dev guard"
// est activé (défaut), seuls les contacts dont l'email figure dans la liste
// peuvent recevoir un courriel. Les agents (User) sont toujours autorisés —
// cette liste ne s'applique qu'aux destinataires externes (Contact).
//
// Stockage fichier (cohérent avec smtp-config.json, portal-domain.json).
// Lors du passage en production, l'admin désactive le guard (enabled=false).
// ============================================================================

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "notification-allowlist.json");

export interface NotificationAllowlist {
  /**
   * Garde de sécurité. Quand true, seuls les `allowedEmails` reçoivent les
   * courriels destinés aux contacts. Quand false, tous les contacts actifs
   * reçoivent normalement (mode production).
   */
  enabled: boolean;
  /**
   * Liste blanche de courriels de contacts qui peuvent recevoir des
   * notifications, même quand `enabled=true`. Comparaison insensible à la
   * casse et sans espaces de part et d'autre.
   */
  allowedEmails: string[];
  /** Dernière modification — purement informatif pour l'UI. */
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_CONFIG: NotificationAllowlist = {
  // Défaut PARANOIAQUE : garde activée + liste vide = aucun contact ne
  // reçoit rien. L'admin doit explicitement ajouter des emails de test.
  enabled: true,
  allowedEmails: [],
};

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

export async function getAllowlist(): Promise<NotificationAllowlist> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NotificationAllowlist>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      allowedEmails: Array.isArray(parsed.allowedEmails)
        ? parsed.allowedEmails
        : [],
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveAllowlist(
  patch: Partial<NotificationAllowlist>,
  updatedBy?: string,
): Promise<NotificationAllowlist> {
  await ensureDataDir();
  const current = await getAllowlist();
  const next: NotificationAllowlist = {
    enabled: patch.enabled ?? current.enabled,
    allowedEmails: Array.isArray(patch.allowedEmails)
      ? // Normalise : trim + lowercase + dedup + filtre vides
        Array.from(
          new Set(
            patch.allowedEmails
              .map((e) => e.trim().toLowerCase())
              .filter((e) => e.length > 0 && e.includes("@")),
          ),
        ).sort()
      : current.allowedEmails,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? current.updatedBy,
  };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/**
 * Point de décision unique : ce courriel de contact peut-il recevoir une
 * notification maintenant ? Utiliser partout où on est sur le point
 * d'envoyer un email à un Contact (pas un User/agent).
 *
 * - `enabled=false` (mode prod) → toujours true
 * - `enabled=true`  (mode dev)  → true ssi l'email figure dans la liste
 *
 * Robuste : lit la liste à chaque appel (pas de cache). Les fréquences
 * d'envoi sont faibles (création de ticket) donc le coût disque est
 * négligeable et ça évite tout souci de cohérence après édition via l'UI.
 */
export async function isAllowedContactEmail(email: string): Promise<boolean> {
  if (!email) return false;
  const cfg = await getAllowlist();
  if (!cfg.enabled) return true;
  const needle = email.trim().toLowerCase();
  return cfg.allowedEmails.includes(needle);
}
