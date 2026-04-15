// ============================================================================
// Smoke-tests manuels pour le pipeline email↔ticket.
// Lance avec : npx tsx scripts/test-email-parse.ts
// ============================================================================

import {
  parseForwardedSender,
  extractTicketNumberFromSubject,
  parseInReplyTo,
  parseReferences,
} from "../src/lib/email-to-ticket/parse";
import {
  sanitizeEmailHtml,
  plainTextToHtml,
  htmlToPlainText,
  normalizeEmailBodyToHtml,
} from "../src/lib/email-to-ticket/html";

function assert(label: string, actual: unknown, expected: unknown): void {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    console.log(`✓ ${label}`);
  } else {
    console.log(`✗ ${label}`);
    console.log(`  attendu : ${JSON.stringify(expected)}`);
    console.log(`  obtenu  : ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  }
}

function assertContains(label: string, actual: string, needle: string): void {
  const pass = actual.includes(needle);
  if (pass) {
    console.log(`✓ ${label}`);
  } else {
    console.log(`✗ ${label}`);
    console.log(`  attendu (contient) : ${JSON.stringify(needle)}`);
    console.log(`  obtenu             : ${JSON.stringify(actual.slice(0, 200))}`);
    process.exitCode = 1;
  }
}

console.log("\n--- parseForwardedSender ---");

// 1. Courriel direct (pas un transfert) → pas de forward
assert(
  "courriel direct n'est pas un forward",
  parseForwardedSender("Mon serveur est lent", "Hello, ça marche pas.", {
    email: "client@hvac.ca",
    name: "Client",
  }),
  { isForward: false },
);

// 2. Transfert Outlook FR avec bloc "De :"
const outlookFr = `
Bonjour Bruno,
Peux-tu prendre en charge stp ?

De : Jean Doe <jdoe@vdsa.ca>
Envoyé : jeudi 10 avril 2025 13:22
À : Bruno Robert <bruno.robert@cetix.ca>
Objet : Problème accès VPN

Mon VPN ne fonctionne plus depuis hier.
`;
const fwdFr = parseForwardedSender("TR: Problème accès VPN", outlookFr, {
  email: "bruno.robert@cetix.ca",
  name: "Bruno Robert",
});
assert("forward FR détecte isForward=true", fwdFr.isForward, true);
assert("forward FR extrait jdoe@vdsa.ca", fwdFr.originalSenderEmail, "jdoe@vdsa.ca");
assert("forward FR extrait Jean Doe", fwdFr.originalSenderName, "Jean Doe");

// 3. Transfert Outlook EN avec "-----Original Message-----"
const outlookEn = `
Please handle this.

-----Original Message-----
From: Alice Smith <asmith@example.com>
Sent: Tuesday, April 8, 2025 9:14 AM
To: Bruno Robert <bruno.robert@cetix.ca>
Subject: Printer offline

Our main printer keeps going offline.
`;
const fwdEn = parseForwardedSender("Fwd: Printer offline", outlookEn, {
  email: "bruno.robert@cetix.ca",
  name: "Bruno Robert",
});
assert("forward EN isForward", fwdEn.isForward, true);
assert("forward EN sender", fwdEn.originalSenderEmail, "asmith@example.com");

// 4. Transfert avec mailto: [Outlook]
const fwdMailto = parseForwardedSender(
  "FW: Urgent",
  "De : Robert Martin [mailto:rmartin@corp.com]\nObjet: blabla",
  { email: "bruno.robert@cetix.ca", name: "Bruno" },
);
assert("forward mailto: sender", fwdMailto.originalSenderEmail, "rmartin@corp.com");

// 5. Transfert sans expéditeur trouvable → isForward=true, pas d'email
const fwdNoSender = parseForwardedSender("Tr: Test", "Aucun bloc From ici", {
  email: "bruno.robert@cetix.ca",
  name: "Bruno",
});
assert("forward sans bloc From → isForward seul", fwdNoSender, { isForward: true });

console.log("\n--- extractTicketNumberFromSubject ---");

assert(
  "subject '[TK-1042]'",
  extractTicketNumberFromSubject("Re: [TK-1042] Mon problème"),
  { prefix: "TK", rawNumber: 42 },
);
assert(
  "subject 'Re: [INT-1050] note interne'",
  extractTicketNumberFromSubject("Re: [INT-1050] note interne"),
  { prefix: "INT", rawNumber: 50 },
);
assert(
  "subject sans tag",
  extractTicketNumberFromSubject("Problème accès VPN"),
  null,
);

console.log("\n--- sanitizeEmailHtml ---");

const scriptyHtml = `<p>Hello <script>alert(1)</script>there</p>`;
assertContains(
  "sanitize retire <script>",
  sanitizeEmailHtml(scriptyHtml),
  "<p>Hello there</p>",
);

const tableHtml = `<table border="1"><tr><td style="background-color:yellow">A</td><td>B</td></tr></table>`;
assertContains("sanitize garde <table>", sanitizeEmailHtml(tableHtml), "<table");
assertContains("sanitize garde <td>", sanitizeEmailHtml(tableHtml), "<td");
assertContains("sanitize garde background-color", sanitizeEmailHtml(tableHtml), "background-color:yellow");

const outlookForwardHtml = `
<div>
  <p>Bonjour,</p>
  <div style="border:1px solid #ccc; padding:8px;">
    <b>De :</b> Jean <jdoe@vdsa.ca><br>
    <b>Envoyé :</b> 10 avril<br>
    <b>Objet :</b> VPN
  </div>
  <blockquote>Mon VPN est en panne.</blockquote>
</div>`;
const cleanedFwd = sanitizeEmailHtml(outlookForwardHtml);
assertContains("forward HTML garde blockquote", cleanedFwd, "<blockquote>");
assertContains("forward HTML garde border-bloc", cleanedFwd, "border:1px solid");

// Lien externe avec target="_blank" rel="noopener"
const linkHtml = `<a href="https://example.com">link</a>`;
assertContains(
  "sanitize ajoute target=_blank rel=noopener sur <a>",
  sanitizeEmailHtml(linkHtml),
  `target="_blank"`,
);

console.log("\n--- plainTextToHtml ---");

const plain = "Bonjour,\n\nUne URL : https://example.com\n\n> Cité 1\n> Cité 2";
const plainHtml = plainTextToHtml(plain);
assertContains("plain→html bâtit des paragraphes", plainHtml, "<p>");
assertContains(
  "plain→html auto-linké",
  plainHtml,
  `<a href="https://example.com"`,
);
assertContains("plain→html détecte blockquote '> ...'", plainHtml, "<blockquote>");

console.log("\n--- normalizeEmailBodyToHtml ---");

assertContains(
  "normalize plain → <p>",
  normalizeEmailBodyToHtml("text", "Hello\nworld"),
  "<p>Hello",
);
assertContains(
  "normalize html garde <b>",
  normalizeEmailBodyToHtml("html", "<b>Gras</b>"),
  "<b>Gras</b>",
);

console.log("\n--- htmlToPlainText ---");

assert(
  "htmlToPlainText strip tags",
  htmlToPlainText("<p>Hello <b>world</b></p>"),
  "Hello world",
);

console.log("\n--- parseInReplyTo / parseReferences ---");

const headers = [
  { name: "In-Reply-To", value: "<abc@example.com>" },
  { name: "References", value: "<first@example.com> <second@example.com>" },
];
assert("parseInReplyTo", parseInReplyTo(headers), "abc@example.com");
assert("parseReferences", parseReferences(headers), ["first@example.com", "second@example.com"]);

if (process.exitCode === 1) {
  console.log("\n✗ Des tests ont échoué.");
  process.exit(1);
}
console.log("\n✓ Tous les tests passent.");
