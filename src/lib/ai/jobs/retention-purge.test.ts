// Tests des helpers pure d'anonymisation. Pas de DB, pas de mocks — on teste
// le CONTRAT des fonctions : quels champs sont strippés, quels champs restent.
//
// Les tests d'intégration (qui font de vrais updates) sont à faire
// manuellement en staging avant d'activer ENABLE_AI_RETENTION_ANONYMIZE=1.
import { describe, it, expect } from "vitest";
import {
  anonymizeInvocationFields,
  anonymizeMemoryFields,
  anonymizeClickFields,
} from "./retention-purge";

describe("anonymizeInvocationFields", () => {
  it("retire les champs identifiants (userId, ticketId, organizationId)", () => {
    const fields = anonymizeInvocationFields();
    expect(fields.userId).toBeNull();
    expect(fields.ticketId).toBeNull();
    expect(fields.organizationId).toBeNull();
  });

  it("remplace response par un marqueur daté (pas null)", () => {
    const fields = anonymizeInvocationFields();
    expect(typeof fields.response).toBe("string");
    expect(fields.response).toMatch(/^\[anonymized:\d{4}-\d{2}-\d{2}\]$/);
  });

  it("retire humanEdit (peut contenir PII : correction manuelle)", () => {
    const fields = anonymizeInvocationFields();
    expect(fields.humanEdit).toBeNull();
  });

  it("retire promptHash (reversibilité partielle via replay)", () => {
    const fields = anonymizeInvocationFields();
    expect(fields.promptHash).toBeNull();
  });

  it("NE touche PAS aux champs stats (pas dans le return)", () => {
    const fields = anonymizeInvocationFields();
    // Feature, costCents, latencyMs, status, promptTokens, responseTokens,
    // createdAt, provider, modelName, sensitivityLevel, scrubApplied,
    // humanAction, actedAt, promptVersion — AUCUN ne doit être dans l'update.
    // Vérifie avec la liste explicite des clés retournées.
    const keys = Object.keys(fields).sort();
    expect(keys).toEqual(
      [
        "userId",
        "ticketId",
        "organizationId",
        "response",
        "humanEdit",
        "promptHash",
      ].sort(),
    );
  });
});

describe("anonymizeMemoryFields", () => {
  it("remplace content par un marqueur daté", () => {
    const fields = anonymizeMemoryFields();
    expect(typeof fields.content).toBe("string");
    expect(fields.content).toMatch(/^\[anonymized:\d{4}-\d{2}-\d{2}\]$/);
  });

  it("dés-associe le scope (org:xxx → anonymized)", () => {
    const fields = anonymizeMemoryFields();
    expect(fields.scope).toBe("anonymized");
  });

  it("préserve category + source (pas dans le return, donc pas modifié)", () => {
    const fields = anonymizeMemoryFields();
    expect(fields.category).toBeUndefined();
    expect(fields.source).toBeUndefined();
    // sampleCount, confidence aussi doivent être intacts.
    expect(fields.sampleCount).toBeUndefined();
    expect(fields.confidence).toBeUndefined();
  });
});

describe("anonymizeClickFields", () => {
  it("retire userId", () => {
    const fields = anonymizeClickFields();
    expect(fields.userId).toBeNull();
  });

  it("remplace sourceTicketId et clickedTicketId par 'anonymized' (pas null — colonne NOT NULL)", () => {
    const fields = anonymizeClickFields();
    expect(fields.sourceTicketId).toBe("anonymized");
    expect(fields.clickedTicketId).toBe("anonymized");
  });

  it("vide matchedTokens (peuvent contenir info sensible)", () => {
    const fields = anonymizeClickFields();
    expect(fields.matchedTokens).toEqual([]);
  });

  it("préserve bucket / score / dwellMs (stats CTR)", () => {
    const fields = anonymizeClickFields();
    expect(fields.bucket).toBeUndefined(); // pas touché
    expect(fields.score).toBeUndefined();
    expect(fields.dwellMs).toBeUndefined();
  });
});

describe("idempotence (signature identique entre appels dans la même seconde)", () => {
  it("deux appels successifs produisent le même marqueur (date UTC)", () => {
    const a = anonymizeInvocationFields();
    const b = anonymizeInvocationFields();
    expect(a.response).toBe(b.response); // même jour ISO
  });
});
