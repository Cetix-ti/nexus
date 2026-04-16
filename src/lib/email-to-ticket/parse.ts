// ============================================================================
// Parsers pour les courriels entrants : détection transfert (sender original),
// extraction du numéro de ticket dans le sujet, parse des en-têtes In-Reply-To
// et References pour le threading.
//
// Le but est d'être robuste sur les en-têtes multilingues (français +
// anglais Outlook) sans jamais flatter le contenu original — on RETOURNE
// juste des métadonnées ; le HTML du body reste intouché pour l'affichage.
// ============================================================================

export interface ForwardedInfo {
  isForward: boolean;
  originalSenderEmail?: string;
  originalSenderName?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

/**
 * Détecte le bloc "De: / From:" imbriqué dans un courriel transféré et
 * retourne l'expéditeur ORIGINAL (pas celui qui a transféré).
 *
 * On accepte plusieurs formes Outlook / Gmail :
 *   - "De : Name <email>"                       (Outlook FR)
 *   - "From: Name <email>"                      (Outlook EN)
 *   - "De : email"                              (Outlook FR sans brackets)
 *   - "From: email"                             (Outlook EN sans brackets)
 *   - "-----Original Message-----\nFrom: ..."   (Outlook quoted)
 *   - "-----Message d'origine-----\nDe : ..."   (Outlook FR quoted)
 *   - "De : Name [mailto:email]"                (Outlook mailto-form)
 *   - Blocs HTML <b>From:</b> / <b>De :</b>
 *
 * Le subject est aussi regardé : seulement un pattern Fw/Fwd/Tr/Transfert/TR:
 * valide le flag `isForward`. Un corps qui commence par "> On ... wrote:" ne
 * passe PAS en forward — c'est un reply threading, géré séparément.
 */
export function parseForwardedSender(
  subject: string,
  rawBody: string,
  fallbackSender: { email: string; name: string },
  options?: {
    /**
     * Si true, on tente l'extraction de l'expéditeur original MÊME si le
     * sujet n'a pas de préfixe Fw/Tr. Utile quand l'email vient de notre
     * propre boîte partagée (billets@cetix.ca) — c'est forcément un
     * transfert d'un agent, même si Outlook a "nettoyé" le préfixe.
     */
    forceBodyScan?: boolean;
  },
): ForwardedInfo {
  const subj = (subject || "").trim();
  // Les préfixes de transfert (Outlook FR/EN, Apple Mail, etc.).
  const fwdSubjectRe = /^(?:fw|fwd|tr|rv|transfert|transféré|wg)\s*:/i;
  const hasForwardPrefix = fwdSubjectRe.test(subj);
  if (!hasForwardPrefix && !options?.forceBodyScan) {
    return { isForward: false };
  }

  // On strip le HTML pour la recherche de blocs "From:" — beaucoup plus
  // robuste que regex multiline sur HTML. On garde les linefeeds.
  // IMPORTANT : décode d'abord &lt;/&gt; pour que les adresses sous forme
  // "&lt;jdoe@vdsa.ca&gt;" redeviennent "<jdoe@vdsa.ca>" lisibles. Puis on
  // strip uniquement les TAGS HTML réels (commencent par une lettre ou /)
  // et PAS les blocs "<user@domain>" qui contiennent un @ (adresses
  // courriel placées dans le texte brut).
  const text = rawBody
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    // Ne strip QUE les vrais tags HTML — pas "<user@domain.tld>".
    .replace(/<(?![^>]*@)[a-zA-Z/!][^>]*>/g, " ")
    .replace(/\r\n/g, "\n");

  // Cherche d'abord le séparateur "-----Original Message-----" / "Message
  // d'origine" et parse APRÈS — c'est le bloc de transfert réel.
  const originalMatch = text.split(
    /-{2,}\s*(?:original\s+message|message\s+(?:d['’]origine|original)|forwarded\s+message)\s*-{2,}/i,
  );
  // Si on a un séparateur, on ne regarde que ce qui suit le premier ;
  // sinon on regarde le body entier (Outlook "mobile" mets directement
  // "De : ..." sans séparateur).
  const searchZone = originalMatch.length > 1 ? originalMatch.slice(1).join("\n") : text;

  // Plusieurs patterns tentés dans l'ordre.
  const patterns: RegExp[] = [
    // "De : Name <email>" / "From: Name <email>"
    /(?:^|\n)\s*(?:de|from|exp[ée]diteur)\s*:\s*(.+?)\s*<(EMAIL)>/im,
    // "De : Name [mailto:email]"
    /(?:^|\n)\s*(?:de|from|exp[ée]diteur)\s*:\s*(.+?)\s*\[mailto:(EMAIL)\]/im,
    // "De : email" sans nom
    /(?:^|\n)\s*(?:de|from|exp[ée]diteur)\s*:\s*(EMAIL)(?!\S)/im,
    // "Sent on behalf of Name <email>"
    /(?:on\s+behalf\s+of|au\s+nom\s+de)\s+(.+?)\s*<(EMAIL)>/im,
  ];

  for (const p of patterns) {
    const re = new RegExp(p.source.replace(/EMAIL/g, EMAIL_RE.source), p.flags);
    const m = searchZone.match(re);
    if (m) {
      const email = (m[2] || m[1]).toLowerCase().trim();
      const name = (m[2] ? m[1] : email.split("@")[0]).replace(/["']/g, "").trim();
      // Si par hasard on est retombé sur le forwarder lui-même, on ignore —
      // pas d'intérêt à s'attribuer le ticket à Bruno.
      if (email && email !== fallbackSender.email.toLowerCase()) {
        return {
          isForward: true,
          originalSenderEmail: email,
          originalSenderName: name || email,
        };
      }
    }
  }

  // Sujet disait "Fwd:" mais on n'a pas trouvé de bloc exploitable — on
  // retourne isForward=true (info utile pour l'UI) mais pas d'expéditeur
  // original → l'appelant retombera sur le forwarder par défaut.
  return { isForward: true };
}

/**
 * Extrait un numéro de ticket déjà formaté (ex: TK-1042, INT-1042, INC-1042)
 * depuis un sujet de courriel de réponse. Utilisé pour threader un courriel
 * de retour vers le ticket existant au lieu d'en créer un nouveau.
 */
export function extractTicketNumberFromSubject(subject: string): {
  prefix: string;
  rawNumber: number;
} | null {
  if (!subject) return null;
  // Cherche "[TK-1042]" ou "TK-1042" — le premier match gagne.
  const m = subject.match(/\[?\s*(TK|INT|INC)\s*[-\s]?\s*(\d{3,})\s*\]?/i);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  // On stocke les tickets avec number = raw (pas 1000+raw). 1000 est
  // ajouté côté UI via formatTicketNumber. Donc on soustrait 1000 pour
  // retrouver le `number` DB tel qu'il existe.
  const padded = parseInt(m[2], 10);
  const rawNumber = padded >= 1000 ? padded - 1000 : padded;
  return { prefix, rawNumber };
}

/**
 * Parse le header In-Reply-To d'un courriel Graph. Multiple values possibles ;
 * on retourne le premier Message-Id trouvé (format <xxx@domain>).
 */
export function parseInReplyTo(headers: Array<{ name: string; value: string }> | undefined): string | null {
  if (!headers) return null;
  for (const h of headers) {
    if (h.name.toLowerCase() === "in-reply-to") {
      const m = h.value.match(/<([^>]+)>/);
      if (m) return m[1];
      return h.value.trim();
    }
  }
  return null;
}

/**
 * Parse le header References — liste de Message-Id. Retourne le dernier
 * (celui de la réponse la plus proche dans la chaîne).
 */
export function parseReferences(headers: Array<{ name: string; value: string }> | undefined): string[] {
  if (!headers) return [];
  for (const h of headers) {
    if (h.name.toLowerCase() === "references") {
      const matches = [...h.value.matchAll(/<([^>]+)>/g)];
      return matches.map((m) => m[1]);
    }
  }
  return [];
}
