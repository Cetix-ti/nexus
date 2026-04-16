// ============================================================================
// Inline-image handling for email-to-ticket ingestion.
//
// Les courriels Outlook/Gmail contiennent souvent des images inline :
// le HTML référence `<img src="cid:image001@01D8..."` et les vraies
// données binaires arrivent comme attachment MIME avec `Content-Id`
// matchant. Sans traitement, le navigateur ne peut pas résoudre
// `cid:...` → images cassées dans la description du ticket.
//
// Approche : pour chaque message avec `hasAttachments=true`, on fetch
// via Graph `/messages/{id}/attachments?$filter=isInline eq true`, on
// upload chaque image vers MinIO (URL publique), et on réécrit le HTML
// en remplaçant `src="cid:{contentId}"` par la vraie URL.
// ============================================================================

import { uploadFile } from "@/lib/storage/minio";

export interface InlineAttachment {
  id: string;
  name: string;
  contentType: string;
  contentId: string;
  /** Base64 encoded file bytes (Graph returns it with $select). */
  contentBytes: string;
  isInline: boolean;
  size: number;
}

/**
 * Fetch les attachments inline d'un message Graph. Retourne une liste
 * vide si aucune image inline ou en cas d'erreur (n'interrompt PAS
 * le flow d'ingestion principal — mieux vaut un ticket sans images
 * qu'aucun ticket).
 */
export async function fetchInlineAttachments(
  mailbox: string,
  messageId: string,
  graphFetch: <T>(path: string) => Promise<T>,
): Promise<InlineAttachment[]> {
  try {
    // Note : Graph n'accepte pas `$filter=isInline eq true` sur tous les
    // tenants (selon la version de l'API). On filtre côté client pour
    // robustesse.
    const res = await graphFetch<{ value: InlineAttachment[] }>(
      `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments?$top=20`,
    );
    if (!res?.value) return [];
    return res.value.filter(
      (a) => a.isInline && a.contentType?.startsWith("image/"),
    );
  } catch {
    return [];
  }
}

/**
 * Upload une attachment inline vers MinIO et retourne l'URL publique.
 * En cas d'échec, retourne null (l'image restera en `cid:` dans le HTML
 * → cassée dans le navigateur, mais le ticket est créé malgré tout).
 */
async function uploadInlineAttachment(
  attachment: InlineAttachment,
): Promise<string | null> {
  try {
    const buffer = Buffer.from(attachment.contentBytes, "base64");
    // Nom "sain" pour l'extension : l'image s'appelle souvent
    // "image001.png" dans Outlook — c'est déjà un bon fallback.
    const name = attachment.name || `inline.${guessExt(attachment.contentType)}`;
    const result = await uploadFile(
      "email-inline-images",
      name,
      buffer,
      attachment.contentType,
    );
    return result.url;
  } catch {
    return null;
  }
}

function guessExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  return "bin";
}

/**
 * Pipeline complet : prend le HTML brut du courriel + la mailbox +
 * messageId, et retourne le HTML avec tous les `cid:` réécrits en
 * URLs MinIO publiques (quand possible).
 *
 * Si `hasAttachments=false` ou s'il n'y a pas d'image inline, le HTML
 * est retourné tel quel sans appel Graph supplémentaire (économie).
 */
export async function rewriteInlineImages(
  html: string,
  mailbox: string,
  messageId: string,
  hasAttachments: boolean,
  graphFetch: <T>(path: string) => Promise<T>,
): Promise<string> {
  if (!hasAttachments) return html;
  // Détection rapide : s'il n'y a aucun `cid:` dans le HTML, pas la
  // peine de fetch les attachments.
  if (!/src\s*=\s*["']?cid:/i.test(html)) return html;

  const attachments = await fetchInlineAttachments(mailbox, messageId, graphFetch);
  if (attachments.length === 0) return html;

  // Upload en parallèle → map contentId (sans `<>`) → public URL.
  const cidMap = new Map<string, string>();
  await Promise.all(
    attachments.map(async (a) => {
      const url = await uploadInlineAttachment(a);
      if (!url) return;
      // Graph renvoie contentId soit avec `<>` soit sans. On normalise.
      const cid = a.contentId.replace(/^<|>$/g, "").toLowerCase();
      cidMap.set(cid, url);
    }),
  );

  if (cidMap.size === 0) return html;

  // Remplace les références dans le HTML. On accepte :
  //   src="cid:xxx", src='cid:xxx', src=cid:xxx (sans guillemets)
  return html.replace(
    /src\s*=\s*(["']?)cid:([^"'\s>]+)\1/gi,
    (match, quote, cid) => {
      const key = cid.toLowerCase();
      const url = cidMap.get(key);
      if (!url) return match; // pas trouvé → on laisse tel quel
      return `src=${quote}${url}${quote}`;
    },
  );
}
