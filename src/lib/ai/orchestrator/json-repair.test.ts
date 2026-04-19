// Tests du parser JSON-repair de l'orchestrateur IA.
import { describe, it, expect } from "vitest";
import { tryParseJson } from "./json-repair";

describe("tryParseJson — cas nominal", () => {
  it("parse un JSON valide", () => {
    expect(tryParseJson('{"foo": 42}')).toEqual({ foo: 42 });
    expect(tryParseJson('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(tryParseJson('"hello"')).toBe("hello");
  });

  it("retourne null pour un input qui n'est pas du JSON parseable", () => {
    expect(tryParseJson("")).toBeNull();
    expect(tryParseJson("not json at all")).toBeNull();
  });
});

describe("tryParseJson — récupération", () => {
  it("strip les fences markdown ```json ... ```", () => {
    const raw = '```json\n{"ok": true}\n```';
    expect(tryParseJson(raw)).toEqual({ ok: true });
  });

  it("strip les fences markdown génériques ``` ... ```", () => {
    const raw = '```\n{"ok": true}\n```';
    expect(tryParseJson(raw)).toEqual({ ok: true });
  });

  it("extrait le premier bloc {...} si entouré de prose", () => {
    const raw = 'Voici le résultat : {"category": "test"} Fin.';
    expect(tryParseJson(raw)).toEqual({ category: "test" });
  });

  it("corrige les trailing commas typiques des modèles légers", () => {
    const raw = '{"a": 1, "b": 2,}';
    const out = tryParseJson(raw);
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it("corrige les single quotes → double quotes (best effort)", () => {
    const raw = "{'key': 'value'}";
    const out = tryParseJson(raw);
    expect(out).toEqual({ key: "value" });
  });
});
