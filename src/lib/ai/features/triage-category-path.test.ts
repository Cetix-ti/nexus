// Tests du résolveur de chemin hiérarchique de catégorie (Bug 3 fix).
//
// Ce helper est la clé du fix qui évite que le LLM retourne un categoryId
// niveau 1 alors qu'il existe un enfant niveau 2 ou 3 qui correspond mieux.
// Il descend l'arbre des catégories en matchant les noms de chemin avec
// tolérance (case, accents, inclusion partielle).
import { describe, it, expect } from "vitest";
import {
  _test_resolveDeepestCategoryFromPath as resolve,
  _test_normalizeName as normalize,
} from "./triage";

// Helpers de construction d'arbre de catégories
interface RawCat {
  id: string;
  name: string;
  parentId: string | null;
}

function mkTree(): {
  rawById: Map<string, RawCat>;
  categories: Array<{ id: string; name: string; path: string[] }>;
} {
  // Arbre type MSP :
  //   Infrastructure (cuid_inf)
  //   └── Serveurs (cuid_srv)
  //       └── Active Directory (cuid_ad)
  //       └── Exchange Online (cuid_exo)
  //   Réseau (cuid_net)
  //   └── VPN (cuid_vpn)
  //       └── FortiClient (cuid_ftc)
  const raw: RawCat[] = [
    { id: "cuid_inf", name: "Infrastructure", parentId: null },
    { id: "cuid_srv", name: "Serveurs", parentId: "cuid_inf" },
    { id: "cuid_ad", name: "Active Directory", parentId: "cuid_srv" },
    { id: "cuid_exo", name: "Exchange Online", parentId: "cuid_srv" },
    { id: "cuid_net", name: "Réseau", parentId: null },
    { id: "cuid_vpn", name: "VPN", parentId: "cuid_net" },
    { id: "cuid_ftc", name: "FortiClient", parentId: "cuid_vpn" },
  ];
  const rawById = new Map<string, RawCat>(raw.map((c) => [c.id, c]));
  const categories = [
    { id: "cuid_inf", name: "Infrastructure", path: ["Infrastructure"] },
    { id: "cuid_srv", name: "Serveurs", path: ["Infrastructure", "Serveurs"] },
    { id: "cuid_ad", name: "Active Directory", path: ["Infrastructure", "Serveurs", "Active Directory"] },
    { id: "cuid_exo", name: "Exchange Online", path: ["Infrastructure", "Serveurs", "Exchange Online"] },
    { id: "cuid_net", name: "Réseau", path: ["Réseau"] },
    { id: "cuid_vpn", name: "VPN", path: ["Réseau", "VPN"] },
    { id: "cuid_ftc", name: "FortiClient", path: ["Réseau", "VPN", "FortiClient"] },
  ];
  return { rawById, categories };
}

describe("resolveDeepestCategoryFromPath", () => {
  const { rawById, categories } = mkTree();

  it("résout le chemin complet niveau 3", () => {
    expect(
      resolve(["Infrastructure", "Serveurs", "Active Directory"], categories, rawById),
    ).toBe("cuid_ad");
  });

  it("résout le chemin partiel niveau 2 quand niveau 3 n'existe pas", () => {
    expect(
      resolve(["Infrastructure", "Serveurs", "Outil Inexistant"], categories, rawById),
    ).toBe("cuid_srv");
  });

  it("résout le chemin au niveau 1 si niveau 2 ne matche pas", () => {
    expect(
      resolve(["Infrastructure", "Branche Bidon"], categories, rawById),
    ).toBe("cuid_inf");
  });

  it("retourne null si la racine ne matche pas", () => {
    expect(
      resolve(["Racine Inconnue", "XYZ"], categories, rawById),
    ).toBeNull();
  });

  it("tolère les variations de casse", () => {
    expect(
      resolve(["infrastructure", "SERVEURS", "active directory"], categories, rawById),
    ).toBe("cuid_ad");
  });

  it("tolère les accents manquants", () => {
    expect(
      resolve(["Reseau", "VPN", "FortiClient"], categories, rawById),
    ).toBe("cuid_ftc");
  });

  it("tolère match 'contient' quand pas de match exact (LLM ajoute précisions)", () => {
    // LLM retourne "Active Directory (AD)" — doit matcher "Active Directory"
    expect(
      resolve(["Infrastructure", "Serveurs", "Active Directory (AD)"], categories, rawById),
    ).toBe("cuid_ad");
  });

  it("rejette path vide ou non-array", () => {
    expect(resolve([], categories, rawById)).toBeNull();
  });

  it("ne descend pas dans une autre branche de l'arbre", () => {
    // "VPN" n'est PAS enfant de "Serveurs" — on ne doit pas traverser
    expect(
      resolve(["Infrastructure", "VPN"], categories, rawById),
    ).toBe("cuid_inf"); // s'arrête au niveau 1 (Infrastructure), VPN n'est pas un enfant de Serveurs
  });
});

describe("normalizeName", () => {
  it("lowercase + supprime accents", () => {
    expect(normalize("Réseau")).toBe("reseau");
    expect(normalize("Élément")).toBe("element");
    expect(normalize("ça va")).toBe("ca va");
  });

  it("normalise les espaces et caractères spéciaux", () => {
    expect(normalize("  A/B  ")).toBe("a b");
    expect(normalize("Ticket #1234")).toBe("ticket 1234");
  });

  it("vide → vide", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});
