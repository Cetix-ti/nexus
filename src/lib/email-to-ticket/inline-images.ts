// ============================================================================
// Email image preservation for email-to-ticket ingestion.
//
// Problème initial : les images "inline" (<img src="cid:...">) des courriels
// pointent vers des parties MIME du message. Sans traitement le navigateur
// ne peut pas résoudre `cid:...` → images cassées dans la description.
//
// Problème étendu : les utilisateurs collent souvent des captures d'écran
// dans Outlook. Selon comment c'est inséré, l'image peut arriver comme :
//   1. Vraie inline CID  (isInline=true, referencée par cid: dans le HTML)
//   2. Attachment inline  (isInline=true, SANS référence dans le HTML)
//   3. Attachment normale (isInline=false, SANS référence dans le HTML)
//   4. Base64 embarqué    (src="data:image/...;base64,...") — déjà autonome
//
// Avant : seul le cas 1 était géré. 2/3 étaient silencieusement perdus.
// Freshservice ré-héberge TOUT (inline et attachments) et affiche les
// orphelines à la fin de la description — c'est ce qu'on fait maintenant.
//
// Approche :
//   - Fetch TOUTES les attachments image (quelle que soit isInline).
//   - Upload chacune vers MinIO (URL publique, stable).
//   - Pour les CID référencées dans le HTML → rewrite src.
//   - Pour les orphelines → append à la fin du HTML dans un bloc "Pièces
//     jointes image" discret, pour que l'agent les voie sans avoir à
//     ouvrir le courriel original.
// ============================================================================

import { uploadFile } from "@/lib/storage/minio";

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  contentId?: string | null;
  /** Base64 encoded file bytes (Graph returns it with $select=contentBytes). */
  contentBytes?: string;
  isInline: boolean;
  size: number;
}

/**
 * Fetch TOUTES les attachments image d'un message Graph (inline + normales).
 * Retourne une liste vide si aucune image ou en cas d'erreur — n'interrompt
 * jamais le flow d'ingestion (mieux vaut un ticket sans images qu'aucun).
 */
async function fetchImageAttachments(
  mailbox: string,
  messageId: string,
  graphFetch: <T>(path: string) => Promise<T>,
): Promise<GraphAttachment[]> {
  try {
    const res = await graphFetch<{ value: GraphAttachment[] }>(
      `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments?$top=50`,
    );
    if (!res?.value) return [];
    return res.value.filter((a) => a.contentType?.startsWith("image/"));
  } catch (err) {
    console.warn("[email-images] fetchImageAttachments échec :", err);
    return [];
  }
}

/**
 * Upload une attachment vers MinIO et retourne l'URL publique.
 * En cas d'échec, retourne null (silencieux — mieux que crasher).
 */
async function uploadAttachment(
  attachment: GraphAttachment,
): Promise<string | null> {
  if (!attachment.contentBytes) return null;
  try {
    const buffer = Buffer.from(attachment.contentBytes, "base64");
    const name = attachment.name || `image.${guessExt(attachment.contentType)}`;
    const result = await uploadFile(
      "email-inline-images",
      name,
      buffer,
      attachment.contentType,
    );
    return result.url;
  } catch (err) {
    console.warn("[email-images] upload échec :", attachment.name, err);
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pipeline complet : prend le HTML brut + la mailbox + messageId, et
 * retourne le HTML avec toutes les images préservées :
 *   - Les CID référencées dans le HTML sont réécrites vers leurs URLs MinIO.
 *   - Les images attachées sans référence (captures d'écran, pièces jointes
 *     normales) sont ajoutées à la fin du HTML dans un bloc "Pièces
 *     jointes" pour que rien ne soit perdu.
 *
 * IMPORTANT : on n'utilise PLUS le flag `hasAttachments` de Graph comme
 * pré-filtre. Outlook le met à `false` quand le mail ne contient QUE des
 * images inline (logos de signature p.ex.) — résultat : les CID des
 * signatures n'étaient jamais résolus et les images apparaissaient cassées
 * dans les tickets. À la place, on déclenche l'appel attachments si :
 *   - le HTML contient au moins un `cid:` (signal fort qu'on doit résoudre)
 *   - OU `hasAttachments` est explicitement true (cas des PJ normales)
 *
 * `hasAttachments` reste accepté en paramètre pour rétro-compat de signature,
 * mais c'est le contenu du HTML qui décide vraiment.
 */
export async function rewriteInlineImages(
  html: string,
  mailbox: string,
  messageId: string,
  hasAttachments: boolean,
  graphFetch: <T>(path: string) => Promise<T>,
): Promise<string> {
  const hasCidRef = /cid:[^"'\s>]+/i.test(html);
  if (!hasCidRef && !hasAttachments) return html;

  const attachments = await fetchImageAttachments(mailbox, messageId, graphFetch);
  if (attachments.length === 0) return html;

  // Upload en parallèle → liste {attachment, url}. Les uploads qui
  // échouent (url=null) sont filtrés.
  const uploads = await Promise.all(
    attachments.map(async (a) => ({ att: a, url: await uploadAttachment(a) })),
  );
  const successful = uploads.filter(
    (u): u is { att: GraphAttachment; url: string } => u.url !== null,
  );
  if (successful.length === 0) return html;

  // Map contentId normalisé → URL (pour le rewrite CID).
  const cidMap = new Map<string, { url: string; att: GraphAttachment }>();
  for (const u of successful) {
    if (u.att.contentId) {
      const cid = u.att.contentId.replace(/^<|>$/g, "").toLowerCase();
      cidMap.set(cid, u);
    }
  }

  // Track quelles attachments ont été référencées dans le HTML — les
  // autres seront listées comme "orphelines" à la fin.
  const referenced = new Set<string>();
  let rewritten = html.replace(
    /src\s*=\s*(["']?)cid:([^"'\s>]+)\1/gi,
    (match, quote, cid) => {
      const key = cid.toLowerCase();
      const entry = cidMap.get(key);
      if (!entry) return match;
      referenced.add(entry.att.id);
      return `src=${quote}${entry.url}${quote}`;
    },
  );

  // Orphelines = uploads non référencées dans le HTML (captures collées,
  // pièces jointes normales). On les ajoute à la fin du HTML — format
  // neutre pour que ça reste lisible à la fois en rendu riche et en
  // plain text.
  const orphans = successful.filter((u) => !referenced.has(u.att.id));
  if (orphans.length > 0) {
    const gallery = orphans
      .map(
        (u) =>
          `<div style="margin:6px 0;"><img src="${u.url}" alt="${escapeHtml(u.att.name || "image")}" style="max-width:100%;height:auto;border-radius:4px;" /></div>`,
      )
      .join("");
    rewritten += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #E2E8F0;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Pièces jointes (${orphans.length})</p>${gallery}</div>`;
  }

  return rewritten;
}
