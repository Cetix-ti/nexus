// ============================================================================
// WEBSITE ENRICHER
// ----------------------------------------------------------------------------
// Given a website URL, extract organization metadata using these strategies:
//
//   1. JSON-LD <script type="application/ld+json"> blocks (Organization /
//      LocalBusiness — most reliable, structured)
//   2. Open Graph + meta tags (og:site_name, og:image, og:description, etc.)
//   3. Favicons (link[rel="icon"], apple-touch-icon, /favicon.ico, Google s2)
//   4. Common contact pages (/contact, /contact-us, /contactez-nous, /nous-joindre)
//      → regex extraction of phones, emails, postal addresses
//   5. Social links (linkedin.com/company/, facebook.com/, twitter.com/)
//
// Security: SSRF protection blocks private/loopback IP ranges and non-HTTP
// schemes. Each fetch has a 10s timeout and a custom User-Agent.
// ============================================================================

import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { lookup } from "dns/promises";

const USER_AGENT =
  "NexusBot/1.0 (+https://nexus.cetix.ca/about; contact@cetix.ca)";
const FETCH_TIMEOUT_MS = 10_000;

// Common contact page paths to try
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contactez-nous",
  "/nous-joindre",
  "/about",
  "/about-us",
  "/a-propos",
];

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------
export interface EnrichmentResult {
  source: string; // the URL we scraped
  name?: string;
  description?: string;
  logo?: string; // absolute URL of best-quality logo found
  phones: string[];
  emails: string[];
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  socialLinks: {
    linkedin?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
  };
  warnings: string[];
}

// ----------------------------------------------------------------------------
// SSRF guard
// ----------------------------------------------------------------------------
function isPrivateIp(ip: string): boolean {
  // IPv4
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  // IPv6 loopback / link-local
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc")) return true;
  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL invalide : ${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Seuls les schémas http/https sont autorisés");
  }
  // Resolve hostname and reject private ranges
  try {
    const { address } = await lookup(parsed.hostname);
    if (isPrivateIp(address)) {
      throw new Error(`Adresse IP privée bloquée : ${address}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("privée")) throw e;
    throw new Error(`DNS introuvable pour ${parsed.hostname}`);
  }
  return parsed;
}

// ----------------------------------------------------------------------------
// Safe fetch with timeout + UA
// ----------------------------------------------------------------------------
async function safeFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Extractors
// ----------------------------------------------------------------------------
function extractJsonLd(root: HTMLElement): any[] {
  const blocks: any[] = [];
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const txt = s.text.trim();
      if (!txt) continue;
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      /* invalid JSON-LD — ignore */
    }
  }
  // Walk @graph if present
  const out: any[] = [];
  for (const b of blocks) {
    if (Array.isArray(b["@graph"])) out.push(...b["@graph"]);
    out.push(b);
  }
  return out;
}

function findOrganization(jsonLd: any[]): any | null {
  // Prefer Organization, then LocalBusiness, then anything with name+address
  const types = ["Organization", "LocalBusiness", "Corporation", "Company"];
  for (const t of types) {
    const found = jsonLd.find(
      (b) => b && (b["@type"] === t || (Array.isArray(b["@type"]) && b["@type"].includes(t)))
    );
    if (found) return found;
  }
  return null;
}

function getMeta(root: HTMLElement, prop: string): string | null {
  const el =
    root.querySelector(`meta[property="${prop}"]`) ||
    root.querySelector(`meta[name="${prop}"]`);
  return el?.getAttribute("content") || null;
}

/**
 * Heuristique de détection du logo, par ordre de fiabilité décroissante :
 *
 *  1. Lien `<link rel="mask-icon">` ou `<link rel="fluid-icon">` (Safari/Apple).
 *  2. Image `<img>` dont le src/alt/class/id contient "logo" — la plus
 *     fiable car la convention est universelle.
 *  3. Première `<img>` à l'intérieur d'un `<header>`, `<nav>` ou élément
 *     dont la classe contient "header"/"navbar"/"brand" (logo en barre du haut).
 *  4. `<link rel="apple-touch-icon">` (généralement carré haute-résolution).
 *  5. Le plus gros `<link rel="icon">` (sizes="…").
 *  6. og:image — RELÉGUÉ EN DERNIER car c'est très souvent une bannière
 *     marketing, pas le logo.
 *
 * Renvoie l'URL absolue du candidat retenu, ou null.
 */
function pickLogoFromHtml(root: HTMLElement, baseUrl: string): string | null {
  // 1. Mask/fluid icons (rares mais toujours le vrai logo quand présents)
  const mask =
    root.querySelector('link[rel="mask-icon"]') ||
    root.querySelector('link[rel="fluid-icon"]');
  if (mask?.getAttribute("href")) {
    return absolutize(mask.getAttribute("href")!, baseUrl);
  }

  // 2. <img> qui ressemble à un logo
  const imgs = root.querySelectorAll("img");
  const logoImg = findLogoImg(imgs, baseUrl);
  if (logoImg) return logoImg;

  // 3. Première <img> dans un <header>/<nav>/element brand
  const headerCandidates = [
    ...root.querySelectorAll("header img"),
    ...root.querySelectorAll("nav img"),
    ...root.querySelectorAll('[class*="header" i] img'),
    ...root.querySelectorAll('[class*="navbar" i] img'),
    ...root.querySelectorAll('[class*="brand" i] img'),
  ];
  for (const img of headerCandidates) {
    const src = img.getAttribute("src") || img.getAttribute("data-src");
    if (src && !looksLikePixelTracker(src)) {
      return absolutize(src, baseUrl);
    }
  }

  // 4. apple-touch-icon
  const apple =
    root.querySelector('link[rel="apple-touch-icon"]') ||
    root.querySelector('link[rel="apple-touch-icon-precomposed"]');
  if (apple?.getAttribute("href")) {
    return absolutize(apple.getAttribute("href")!, baseUrl);
  }

  // 5. Plus gros favicon déclaré
  const icons = root
    .querySelectorAll('link[rel*="icon" i]')
    .map((el) => ({
      href: el.getAttribute("href"),
      sizes: el.getAttribute("sizes") || "",
      type: el.getAttribute("type") || "",
    }))
    .filter((x) => x.href);
  icons.sort((a, b) => {
    // SVG > grosse taille > reste
    const aSvg = a.type.includes("svg") ? 1 : 0;
    const bSvg = b.type.includes("svg") ? 1 : 0;
    if (aSvg !== bSvg) return bSvg - aSvg;
    return sizeOf(b.sizes) - sizeOf(a.sizes);
  });
  if (icons[0]?.href) return absolutize(icons[0].href, baseUrl);

  // 6. og:image en dernier recours (souvent une bannière)
  const og = getMeta(root, "og:image") || getMeta(root, "og:image:url");
  if (og) return absolutize(og, baseUrl);

  return null;
}

/**
 * Cherche parmi des `<img>` celui qui ressemble le plus à un logo
 * (src/alt/class/id contiennent "logo"), en privilégiant les SVG.
 */
function findLogoImg(
  imgs: HTMLElement[],
  baseUrl: string
): string | null {
  const candidates: { src: string; score: number }[] = [];
  for (const img of imgs) {
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      "";
    if (!src || looksLikePixelTracker(src)) continue;
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    const cls = (img.getAttribute("class") || "").toLowerCase();
    const id = (img.getAttribute("id") || "").toLowerCase();
    const srcLower = src.toLowerCase();
    let score = 0;
    if (/\blogo\b/.test(alt)) score += 5;
    if (/\blogo\b/.test(cls)) score += 5;
    if (/\blogo\b/.test(id)) score += 5;
    if (/\/logo[\.\-_]/.test(srcLower) || /\/logo$/.test(srcLower)) score += 4;
    if (srcLower.includes("logo")) score += 2;
    if (srcLower.endsWith(".svg")) score += 3; // SVG = vectoriel = quasi toujours un logo
    // Pénalisations
    if (
      srcLower.includes("banner") ||
      srcLower.includes("hero") ||
      srcLower.includes("background") ||
      srcLower.includes("/avatar") ||
      srcLower.includes("placeholder")
    )
      score -= 4;
    if (score > 0) candidates.push({ src, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return absolutize(candidates[0].src, baseUrl);
}

function looksLikePixelTracker(src: string): boolean {
  // Filtre les pixels d'analytics 1x1 GIF/PNG, base64 transparent, etc.
  if (src.startsWith("data:image/gif;base64,R0lGODlh")) return true;
  if (/[?&](w|width)=1\b/.test(src)) return true;
  if (/pixel|track|spacer|blank/i.test(src)) return true;
  return false;
}

function sizeOf(sizesAttr: string): number {
  if (!sizesAttr || sizesAttr === "any") return 0;
  const m = sizesAttr.match(/(\d+)x(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function absolutize(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

// Quebec/Canadian + US phone regex (E.164 + common formatting)
const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Canadian postal code: A1A 1A1
const CA_POSTAL_RE = /\b[A-Z]\d[A-Z][\s-]?\d[A-Z]\d\b/i;
// US ZIP: 12345 or 12345-6789
const US_ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractPhonesFromText(text: string): string[] {
  const matches = text.match(PHONE_RE) || [];
  return uniq(
    matches
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.replace(/\D/g, "").length >= 10)
      // Filtre les faux positifs : codes postaux US/CA, numéros de TVA, dates, etc.
      .filter((p) => {
        const digits = p.replace(/\D/g, "");
        // Numéros nord-américains valides commencent par 2-9 (NPA)
        const npa = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
        return /^[2-9]/.test(npa);
      })
  ).slice(0, 5);
}

/**
 * Extrait les téléphones via les liens `<a href="tel:...">` — bien plus
 * fiable que le scan de texte brut, car explicitement marqué par le site.
 */
function extractPhonesFromTelLinks(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const a of root.querySelectorAll('a[href^="tel:" i]')) {
    const href = a.getAttribute("href") || "";
    const num = href.replace(/^tel:/i, "").trim();
    if (num.replace(/\D/g, "").length >= 10) out.push(num);
  }
  return uniq(out).slice(0, 5);
}

/**
 * Tente d'extraire une adresse civique complète depuis le HTML, sans
 * dépendre de JSON-LD. Stratégies :
 *   1. Balise sémantique `<address>`
 *   2. Microdata `[itemprop="streetAddress"]`
 *   3. Texte multi-lignes contenant un code postal canadien/US, en
 *      remontant 2 lignes au-dessus pour récupérer la rue.
 */
function extractAddressFromHtml(
  root: HTMLElement
): EnrichmentResult["address"] | undefined {
  // 1. <address> tag
  const addrTag = root.querySelector("address");
  if (addrTag) {
    const txt = (addrTag.text || "").replace(/\s+/g, " ").trim();
    if (txt.length > 5) {
      const parsed = parseAddressBlock(txt);
      if (parsed) return parsed;
    }
  }

  // 2. Microdata
  const street = root.querySelector('[itemprop="streetAddress"]')?.text?.trim();
  if (street) {
    const out: NonNullable<EnrichmentResult["address"]> = { street };
    const city = root.querySelector('[itemprop="addressLocality"]')?.text?.trim();
    const region = root.querySelector('[itemprop="addressRegion"]')?.text?.trim();
    const postal = root.querySelector('[itemprop="postalCode"]')?.text?.trim();
    const country = root.querySelector('[itemprop="addressCountry"]')?.text?.trim();
    if (city) out.city = city;
    if (region) out.province = region;
    if (postal) out.postalCode = postal;
    if (country) out.country = country;
    return out;
  }

  // 3. Heuristique texte : trouver un code postal CA/US et remonter
  const text = root.text || "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ca = line.match(CA_POSTAL_RE);
    if (ca) {
      // Reconstruit l'adresse à partir des 3 lignes au-dessus + cette ligne
      const block = lines.slice(Math.max(0, i - 2), i + 1).join(", ");
      return parseAddressBlock(block);
    }
  }
  return undefined;
}

/**
 * Parse un bloc texte contenant une adresse complète multi-lignes en
 * `{ street, city, province, postalCode, country }`. Best-effort.
 */
function parseAddressBlock(
  block: string
): EnrichmentResult["address"] | undefined {
  const cleaned = block.replace(/\s+/g, " ").trim();
  const out: NonNullable<EnrichmentResult["address"]> = {};
  // Code postal canadien
  const ca = cleaned.match(CA_POSTAL_RE);
  if (ca) {
    out.postalCode = ca[0].toUpperCase().replace(/\s*-\s*/, " ");
    out.country = "Canada";
  } else {
    const us = cleaned.match(US_ZIP_RE);
    if (us) {
      out.postalCode = us[0];
      out.country = "United States";
    }
  }
  // Province : abréviation 2 lettres précédant le code postal
  const provMatch = cleaned.match(
    /\b(QC|ON|BC|AB|MB|SK|NS|NB|NL|PE|NT|YT|NU)\b/i
  );
  if (provMatch) out.province = provMatch[0].toUpperCase();
  // Ville : segment juste avant la province (séparé par une virgule)
  if (out.province) {
    const re = new RegExp(`,\\s*([^,]+?)\\s*,\\s*${out.province}`, "i");
    const m = cleaned.match(re);
    if (m) out.city = m[1].trim();
  }
  // Rue : début de la chaîne jusqu'à la première virgule, en exigeant
  // un numéro civique au début (sinon on rejette).
  const beforeComma = cleaned.split(",")[0].trim();
  if (/^\d+\s+\S/.test(beforeComma)) {
    out.street = beforeComma;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(EMAIL_RE) || [];
  return uniq(
    matches.filter(
      (e) => !e.includes("example.com") && !e.includes("yoursite") && !e.endsWith(".png")
    )
  ).slice(0, 5);
}

function extractAddressFromJsonLd(org: any): EnrichmentResult["address"] | undefined {
  const a = org?.address;
  if (!a) return undefined;
  if (typeof a === "string") {
    return { street: a };
  }
  return {
    street: a.streetAddress,
    city: a.addressLocality,
    province: a.addressRegion,
    postalCode: a.postalCode,
    country: a.addressCountry?.name || a.addressCountry,
  };
}

function extractSocialLinks(
  root: HTMLElement
): EnrichmentResult["socialLinks"] {
  const out: EnrichmentResult["socialLinks"] = {};
  const links = root.querySelectorAll("a[href]");
  for (const l of links) {
    const href = l.getAttribute("href") || "";
    if (!out.linkedin && /linkedin\.com\/(company|in)\//.test(href)) out.linkedin = href;
    if (!out.facebook && /facebook\.com\//.test(href) && !href.includes("sharer")) out.facebook = href;
    if (!out.twitter && /(twitter\.com|x\.com)\//.test(href) && !href.includes("intent")) out.twitter = href;
    if (!out.instagram && /instagram\.com\//.test(href)) out.instagram = href;
    if (!out.youtube && /youtube\.com\//.test(href)) out.youtube = href;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------
export async function enrichFromWebsite(rawUrl: string): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    source: rawUrl,
    phones: [],
    emails: [],
    socialLinks: {},
    warnings: [],
  };

  // SSRF guard
  let parsed: URL;
  try {
    parsed = await assertSafeUrl(rawUrl);
  } catch (e) {
    result.warnings.push((e as Error).message);
    return result;
  }

  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  // Step 1: fetch homepage
  const homepageHtml = await safeFetch(baseUrl);
  if (!homepageHtml) {
    result.warnings.push(`Impossible de charger ${baseUrl}`);
  } else {
    const root = parseHtml(homepageHtml);
    const jsonLd = extractJsonLd(root);
    const org = findOrganization(jsonLd);

    // Name
    if (org?.name) result.name = org.name;
    if (!result.name) result.name = getMeta(root, "og:site_name") || undefined;
    if (!result.name) {
      const title = root.querySelector("title")?.text;
      if (title) result.name = title.split(/[|·–—-]/)[0].trim();
    }

    // Description
    if (org?.description) result.description = org.description;
    if (!result.description) result.description = getMeta(root, "og:description") || undefined;
    if (!result.description) result.description = getMeta(root, "description") || undefined;

    // Logo
    if (org?.logo) {
      result.logo =
        typeof org.logo === "string" ? absolutize(org.logo, baseUrl) : org.logo.url;
    }
    if (!result.logo) result.logo = pickLogoFromHtml(root, baseUrl) || undefined;
    if (!result.logo) {
      // Final fallback: Google s2 favicons
      result.logo = `https://www.google.com/s2/favicons?domain=${parsed.host}&sz=128`;
      result.warnings.push("Logo non trouvé sur le site — utilisation du favicon Google s2");
    }

    // Phone — priorité aux liens tel: (les plus fiables), puis JSON-LD,
    // puis regex sur le texte brut.
    result.phones.push(...extractPhonesFromTelLinks(root));
    if (org?.telephone) result.phones.push(org.telephone);

    // Address — JSON-LD d'abord, sinon heuristique HTML (balise <address>,
    // microdata, ou bloc de texte autour d'un code postal).
    const addr = extractAddressFromJsonLd(org) || extractAddressFromHtml(root);
    if (addr) result.address = addr;

    // Social
    result.socialLinks = extractSocialLinks(root);

    // Extract phones/emails from homepage text as backup
    const homepageText = root.text || "";
    result.phones.push(...extractPhonesFromText(homepageText));
    result.emails.push(...extractEmailsFromText(homepageText));
  }

  // Step 2: visit contact pages for more phones/addresses
  for (const path of CONTACT_PATHS) {
    if (result.phones.length >= 3 && result.address?.street) break;
    const url = `${baseUrl}${path}`;
    const html = await safeFetch(url);
    if (!html) continue;
    const root = parseHtml(html);
    const text = root.text || "";

    // Téléphones : tel: links + texte
    result.phones.push(...extractPhonesFromTelLinks(root));
    result.phones.push(...extractPhonesFromText(text));
    result.emails.push(...extractEmailsFromText(text));

    // Adresse : si on n'a pas encore de rue, on relance l'heuristique HTML
    // sur la page contact (souvent là où l'adresse est explicitement listée).
    if (!result.address?.street) {
      const contactAddr = extractAddressFromHtml(root);
      if (contactAddr) {
        result.address = { ...result.address, ...contactAddr };
      }
    }

    // Code postal en dernier recours via regex
    if (!result.address?.postalCode) {
      const ca = text.match(CA_POSTAL_RE);
      if (ca) {
        if (!result.address) result.address = {};
        result.address.postalCode = ca[0].toUpperCase();
        result.address.country = result.address.country || "Canada";
      } else {
        const us = text.match(US_ZIP_RE);
        if (us) {
          if (!result.address) result.address = {};
          result.address.postalCode = us[0];
          result.address.country = result.address.country || "United States";
        }
      }
    }
    // On NE break PAS systématiquement — on essaie plusieurs pages contact
    // jusqu'à avoir une rue + au moins un téléphone.
    if (result.address?.street && result.phones.length > 0) break;
  }

  // Dedupe lists
  result.phones = uniq(result.phones).slice(0, 5);
  result.emails = uniq(result.emails).slice(0, 5);

  return result;
}
