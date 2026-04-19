// Tests du filtre anti-junk pour l'extraction de vocabulaire client.
// Utilise les EXEMPLES RÉELS rapportés par l'utilisateur (ticket TK-28634)
// pour prévenir la régression.
import { describe, it, expect } from "vitest";
import {
  looksLikeJunkToken,
  stripEmailSignatures,
} from "./client-vocabulary";

describe("looksLikeJunkToken — cas réels rapportés (TK-28634)", () => {
  it("rejette les cuid-like (24-25 chars alphanum)", () => {
    expect(looksLikeJunkToken("bethbe9vppablntj71yhvhr4g")).toBe(true);
  });

  it("rejette les session IDs courts (12 chars, alternance)", () => {
    expect(looksLikeJunkToken("nhunsx9ww1yw")).toBe(true);
    expect(looksLikeJunkToken("n6dsmwiks1jr")).toBe(true);
  });

  it("rejette les URL-encoded (%2F → 2f prefix)", () => {
    expect(looksLikeJunkToken("2fsainteannedebellevue")).toBe(true);
    expect(looksLikeJunkToken("2fusers")).toBe(true);
  });
});

describe("looksLikeJunkToken — règles génériques", () => {
  it("rejette les tokens > 15 chars", () => {
    expect(looksLikeJunkToken("abcdefghijklmnopqrstuvwx")).toBe(true);
  });

  it("rejette les hex-like (≥ 10 chars, chars dans [a-f0-9])", () => {
    expect(looksLikeJunkToken("deadbeef12")).toBe(true);
    expect(looksLikeJunkToken("abcd1234ef")).toBe(true);
    expect(looksLikeJunkToken("ffffffffff")).toBe(true);
  });

  it("rejette les tokens sans voyelle (≥ 5 chars)", () => {
    expect(looksLikeJunkToken("xwqztm")).toBe(true);
    expect(looksLikeJunkToken("bcdfgh")).toBe(true);
  });

  it("rejette les tokens avec ratio digits > 30%", () => {
    expect(looksLikeJunkToken("abc12345")).toBe(true); // 5/8 = 62%
    expect(looksLikeJunkToken("h3llo4")).toBe(true); // 2/6 = 33%
  });

  it("rejette les tokens à transitions alternées (cuid-like)", () => {
    expect(looksLikeJunkToken("a1b2c3d4e5")).toBe(true);
    expect(looksLikeJunkToken("x9y8z7w6v5")).toBe(true);
  });

  it("rejette chaînes vides / null", () => {
    expect(looksLikeJunkToken("")).toBe(true);
  });
});

describe("looksLikeJunkToken — ACCEPTE les vrais tokens de vocabulaire", () => {
  it("accepte les hostnames structurés typiques", () => {
    expect(looksLikeJunkToken("srv-ad01")).toBe(false);
    expect(looksLikeJunkToken("wks-boss")).toBe(false);
    expect(looksLikeJunkToken("dc01")).toBe(false);
  });

  it("accepte les acronymes métier FR/EN", () => {
    expect(looksLikeJunkToken("crm")).toBe(false);
    expect(looksLikeJunkToken("erp")).toBe(false);
    expect(looksLikeJunkToken("fortinet")).toBe(false);
    expect(looksLikeJunkToken("anydesk")).toBe(false);
    expect(looksLikeJunkToken("veeam")).toBe(false);
    expect(looksLikeJunkToken("cerbere")).toBe(false);
  });

  it("accepte les noms d'applications", () => {
    expect(looksLikeJunkToken("cliniplus")).toBe(false);
    expect(looksLikeJunkToken("biomed")).toBe(false);
    expect(looksLikeJunkToken("wordpress")).toBe(false);
    expect(looksLikeJunkToken("bitlocker")).toBe(false);
  });

  it("accepte les tokens courts (≤ 4 chars) sans règle particulière", () => {
    // Note : MIN_TOKEN_LEN=4 est appliqué en amont dans extractVocabTokens —
    // looksLikeJunkToken() ne rejette pas automatiquement les courts ici.
    expect(looksLikeJunkToken("ad")).toBe(false);
    expect(looksLikeJunkToken("vpn")).toBe(false);
  });
});

describe("stripEmailSignatures", () => {
  it("tronque à la ligne '--' (séparateur RFC 3676)", () => {
    const input = `Mon imprimante ne fonctionne plus.
Merci de ton aide.

--
Bruno Robert
Directeur Services
Cetix Inc. | (418) 555-1234`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("Bruno Robert");
    expect(result).not.toContain("Cetix Inc.");
    expect(result).toContain("imprimante");
  });

  it("tronque à 'Cordialement,' (closing FR)", () => {
    const input = `Voici le problème. Le VPN ne connecte plus depuis ce matin.

Cordialement,
Jean Dupont
Directeur IT`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("Jean Dupont");
    expect(result).not.toContain("Cordialement");
    expect(result).toContain("VPN");
  });

  it("tronque à 'Thanks,' (closing EN)", () => {
    const input = `The printer is stuck.

Thanks,
John Smith`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("John Smith");
    expect(result).toContain("printer");
  });

  it("tronque à '-----Original Message-----' (forward Outlook)", () => {
    const input = `Je te transfère, peux-tu regarder ?

-----Original Message-----
From: client@somecorp.com
Subject: Problème Teams`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("Original Message");
    expect(result).not.toContain("somecorp");
    expect(result).toContain("transfère");
  });

  it("tronque à 'De :' (forward FR Outlook)", () => {
    const input = `Voici l'email du client.

De : marie@client.ca
Envoyé : lundi 14 avril
À : support@cetix.ca`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("marie@client.ca");
    expect(result).toContain("client");
  });

  it("tronque à 'Sent from my iPhone' (signature mobile)", () => {
    const input = `Reboot has not fixed it.

Sent from my iPhone`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("iPhone");
    expect(result).toContain("Reboot");
  });

  it("ne tronque PAS 'merci' en milieu de phrase", () => {
    const input = "Je voulais te dire merci pour ton aide sur ce ticket VPN.";
    const result = stripEmailSignatures(input);
    // "merci" au milieu ne déclenche pas le closing regex (needs \n\s*)
    expect(result).toContain("merci");
    expect(result).toContain("VPN");
  });

  it("retourne vide pour null/undefined/vide", () => {
    expect(stripEmailSignatures("")).toBe("");
  });

  it("retourne le texte intact si aucun marqueur de signature", () => {
    const input = "Outlook ne fonctionne plus. Les courriels ne s'envoient pas.";
    expect(stripEmailSignatures(input)).toBe(input);
  });

  it("combine plusieurs marqueurs — tronque au premier rencontré", () => {
    const input = `Le problème VPN persiste.

Cordialement,
Jean

-----Original Message-----
From: old@mail.com`;
    const result = stripEmailSignatures(input);
    expect(result).not.toContain("Original Message");
    expect(result).not.toContain("Jean");
    expect(result).toContain("VPN");
  });
});
