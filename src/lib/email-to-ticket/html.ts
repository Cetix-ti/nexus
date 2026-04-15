// ============================================================================
// HTML handling for incoming/outgoing ticket emails.
//
// Objectif : préserver la mise en page des courriels (Freshservice-style)
// tout en bloquant les injections. On garde largement les tags structurels
// + attributs visuels (couleurs, bordures, alignement, images inline),
// et on tue ce qui peut exécuter du code ou exfiltrer des données.
// ============================================================================

import sanitizeHtml, { type IOptions } from "sanitize-html";

/**
 * Config de sanitization commune à l'ingestion et à l'affichage.
 * Permet tableaux Outlook, signatures, listes, blockquotes, citations,
 * et styles inline limités (couleur, fond, police, alignement).
 */
const RICH_EMAIL_CONFIG: IOptions = {
  allowedTags: [
    "a", "abbr", "article", "b", "bdi", "bdo", "blockquote", "br", "caption",
    "center", "cite", "code", "col", "colgroup", "data", "dd", "del", "details",
    "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "font", "h1", "h2",
    "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "i", "img", "ins", "kbd",
    "li", "main", "mark", "nav", "ol", "p", "pre", "q", "s", "samp", "section",
    "small", "span", "strike", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var", "wbr",
  ],
  allowedAttributes: {
    "*": ["style", "class", "id", "lang", "dir", "title", "align"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "srcset", "alt", "width", "height", "loading"],
    td: ["colspan", "rowspan", "valign", "align", "width", "bgcolor"],
    th: ["colspan", "rowspan", "valign", "align", "width", "bgcolor", "scope"],
    table: ["border", "cellpadding", "cellspacing", "width", "align", "bgcolor"],
    tr: ["align", "valign", "bgcolor"],
    col: ["span", "width"],
    colgroup: ["span", "width"],
    font: ["color", "face", "size"],
    blockquote: ["cite"],
  },
  // Autorise les images inline CID/data et les ancres internes / externes
  // http(s). Pas de javascript:, pas de file:, pas de vbscript.
  allowedSchemes: ["http", "https", "mailto", "tel", "cid", "data"],
  allowedSchemesByTag: {
    img: ["http", "https", "cid", "data"],
    a: ["http", "https", "mailto", "tel"],
  },
  allowProtocolRelative: false,
  // Tue tout ce qui reste : scripts inline, styles globaux, objets embed.
  disallowedTagsMode: "discard",
  // Limite les propriétés CSS inline à un ensemble sûr pour ne pas casser
  // la mise en page tout en interdisant position:fixed, expression(...),
  // url(javascript:...) etc.
  allowedStyles: {
    "*": {
      color: [/^.*$/],
      "background-color": [/^.*$/],
      "background": [/^(?!.*url\s*\(\s*javascript).*$/i],
      "font-size": [/^.*$/],
      "font-family": [/^.*$/],
      "font-weight": [/^.*$/],
      "font-style": [/^.*$/],
      "text-align": [/^.*$/],
      "text-decoration": [/^.*$/],
      "padding": [/^.*$/],
      "padding-left": [/^.*$/],
      "padding-right": [/^.*$/],
      "padding-top": [/^.*$/],
      "padding-bottom": [/^.*$/],
      "margin": [/^.*$/],
      "margin-left": [/^.*$/],
      "margin-right": [/^.*$/],
      "margin-top": [/^.*$/],
      "margin-bottom": [/^.*$/],
      "border": [/^.*$/],
      "border-collapse": [/^.*$/],
      "border-spacing": [/^.*$/],
      "border-top": [/^.*$/],
      "border-bottom": [/^.*$/],
      "border-left": [/^.*$/],
      "border-right": [/^.*$/],
      "border-color": [/^.*$/],
      "border-style": [/^.*$/],
      "border-width": [/^.*$/],
      "width": [/^.*$/],
      "height": [/^.*$/],
      "max-width": [/^.*$/],
      "min-width": [/^.*$/],
      "display": [/^(block|inline|inline-block|table|table-cell|table-row|flex|none)$/i],
      "vertical-align": [/^.*$/],
      "line-height": [/^.*$/],
      "letter-spacing": [/^.*$/],
      "white-space": [/^.*$/],
      "word-wrap": [/^.*$/],
      "word-break": [/^.*$/],
      "list-style": [/^.*$/],
      "list-style-type": [/^.*$/],
      "list-style-position": [/^.*$/],
    },
  },
  transformTags: {
    // Ouvre tous les liens dans un nouvel onglet, sans fuiter le referrer.
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

/**
 * Nettoie un HTML de courriel pour stockage/affichage safe tout en
 * préservant tableaux, listes, couleurs, blockquotes, signatures, etc.
 * Sortie prête à être injectée via dangerouslySetInnerHTML.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  // Pré-traitement : extrait le <body>...</body> si présent, sinon on
  // garde tout. Supprime les éventuels BOM / Windows smart quotes
  // mal encodés qui cassent rarement le rendu mais pas indispensable.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const source = bodyMatch ? bodyMatch[1] : html;
  return sanitizeHtml(source, RICH_EMAIL_CONFIG);
}

/**
 * Convertit un body plain-text d'un courriel en HTML minimal qui préserve
 * sauts de ligne, paragraphes et citations "> ..." typiques Outlook.
 * Sert à normaliser l'affichage quand le courriel n'a pas de contentType=html.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  // Escape HTML d'abord pour éviter toute injection depuis plain.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // Auto-link les URLs http(s).
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  // Regroupe en paragraphes sur ligne vide, garde <br> pour les sauts
  // simples — mimique Outlook.
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((block) => {
      const withBr = block.replace(/\n/g, "<br>");
      // Citations Outlook "> ..." → blockquote visuelle.
      if (/^(?:&gt;\s?).+/m.test(withBr)) {
        const cleaned = withBr.replace(/(^|<br>)(?:&gt;\s?)/g, "$1");
        return `<blockquote>${cleaned}</blockquote>`;
      }
      return `<p>${withBr}</p>`;
    })
    .join("");
  return paragraphs;
}

/**
 * Convertit du HTML en plain-text lisible pour stockage dans `description`
 * (fallback / recherche / aperçus). Contrairement à `.replace(/<[^>]+>/g, " ")`,
 * on préserve les retours à la ligne pour les blocs et les listes.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text,
  })
    // Ajoute des sauts au bon endroit en pre-processant avant de strip.
    // Simplification : on repasse ici pour compresser les espaces.
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Normalise un body Graph (contentType "html" ou "text") vers un HTML
 * safe prêt à stocker dans Ticket.descriptionHtml / Comment.bodyHtml.
 * Si le contenu est plain, on le convertit en HTML structuré.
 */
export function normalizeEmailBodyToHtml(
  contentType: string | undefined,
  content: string | undefined,
  bodyPreview?: string,
): string {
  const raw = content || bodyPreview || "";
  if (!raw) return "";
  if ((contentType || "").toLowerCase() === "html") {
    return sanitizeEmailHtml(raw);
  }
  return plainTextToHtml(raw);
}
