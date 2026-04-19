// Tests du validateur MITRE ATT&CK.
import { describe, it, expect } from "vitest";
import {
  isValidTactic,
  isValidTechnique,
  filterValidTactics,
  filterValidTechniques,
  normalizeTactic,
  normalizeTechnique,
} from "./mitre";

describe("MITRE tactic validator", () => {
  it("accepte les 14 tactiques officielles", () => {
    const valid = [
      "TA0001", "TA0002", "TA0003", "TA0004", "TA0005",
      "TA0006", "TA0007", "TA0008", "TA0009", "TA0010",
      "TA0011", "TA0040", "TA0042", "TA0043",
    ];
    for (const id of valid) {
      expect(isValidTactic(id)).toBe(true);
    }
  });

  it("rejette les tactiques hallucinées", () => {
    expect(isValidTactic("TA0099")).toBe(false);
    expect(isValidTactic("TA9999")).toBe(false);
    expect(isValidTactic("T1001")).toBe(false); // technique, pas tactique
    expect(isValidTactic("")).toBe(false);
    expect(isValidTactic("bogus")).toBe(false);
  });

  it("normalise la casse et les espaces", () => {
    expect(isValidTactic("ta0001")).toBe(true);
    expect(isValidTactic("  TA0001  ")).toBe(true);
    expect(normalizeTactic("ta0006")).toBe("TA0006");
    expect(normalizeTactic("TA9999")).toBeNull();
    expect(normalizeTactic(null)).toBeNull();
  });
});

describe("MITRE technique validator", () => {
  it("accepte le format standard T\\d{4}", () => {
    expect(isValidTechnique("T1110")).toBe(true);
    expect(isValidTechnique("T1078")).toBe(true);
    expect(isValidTechnique("T1547")).toBe(true);
  });

  it("accepte les sous-techniques T\\d{4}.\\d{3}", () => {
    expect(isValidTechnique("T1110.001")).toBe(true);
    expect(isValidTechnique("T1078.002")).toBe(true);
  });

  it("rejette les formats invalides", () => {
    expect(isValidTechnique("T999")).toBe(false); // 3 digits
    expect(isValidTechnique("T12345")).toBe(false); // 5 digits
    expect(isValidTechnique("T1110.1")).toBe(false); // sous-tech 1 digit
    expect(isValidTechnique("T1110.0001")).toBe(false); // sous-tech 4 digits
    expect(isValidTechnique("TA0001")).toBe(false); // tactique, pas technique
    expect(isValidTechnique("1110")).toBe(false); // pas de T
    expect(isValidTechnique("")).toBe(false);
  });

  it("normalise la casse", () => {
    expect(normalizeTechnique("t1110")).toBe("T1110");
    expect(normalizeTechnique("t1110.001")).toBe("T1110.001");
  });
});

describe("filterValidTactics / filterValidTechniques", () => {
  it("conserve uniquement les IDs valides d'un mélange", () => {
    const input = ["TA0001", "TA0099", "T1110", "invalid", "TA0006"];
    expect(filterValidTactics(input)).toEqual(["TA0001", "TA0006"]);
    expect(filterValidTechniques(input)).toEqual(["T1110"]);
  });

  it("dédoublonnage NON effectué (responsabilité du caller)", () => {
    // Le filtre garde simplement ce qui valide — si le LLM répète, on garde
    // les doublons. Le caller doit dédup s'il le souhaite.
    const input = ["TA0001", "TA0001", "TA0002"];
    expect(filterValidTactics(input)).toEqual(["TA0001", "TA0001", "TA0002"]);
  });

  it("tableau vide → tableau vide", () => {
    expect(filterValidTactics([])).toEqual([]);
    expect(filterValidTechniques([])).toEqual([]);
  });
});
