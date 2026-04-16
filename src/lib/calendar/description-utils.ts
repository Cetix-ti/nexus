// ============================================================================
// Helpers partagés pour le traitement du champ `description` des events.
//
// Les events calendrier stockent la description en plain text (rendu
// `whitespace-pre-wrap` côté drawer), mais plusieurs sources peuvent
// essayer d'y mettre du HTML :
//   - Outlook via Graph retourne `body.content` en HTML même pour les
//     events sans description saisie (squelette `<html><body></body></html>`
//     ou `<html><body>&nbsp;</body></html>`).
//   - L'UI peut envoyer du HTML si le formulaire est mal côté client.
//
// On normalise donc à l'entrée : tout ce qui arrive est passé par
// `stripHtmlToText` qui retire les balises, décode les entités, et
// retourne `null` quand il ne reste que du blanc.
// ============================================================================

/**
 * Convertit un contenu HTML (ou texte mixte) en plain text propre.
 *
 * - Supprime `<style>` / `<script>` avec leur contenu.
 * - Remplace `<br>` et fermetures de blocs par des sauts de ligne.
 * - Décode les entités HTML courantes.
 * - Normalise les espaces et limite les sauts de ligne consécutifs à 2.
 * - Retourne `null` si le résultat final ne contient que du blanc.
 */
export function stripHtmlToText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
  text = text
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width characters
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : null;
}
