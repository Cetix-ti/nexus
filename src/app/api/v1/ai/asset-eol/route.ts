import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_ASSET_EOL } from "@/lib/ai/orchestrator/policies";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const body = await req.json();
  const { manufacturer, model, type } = body as {
    manufacturer?: string;
    model?: string;
    type?: string;
  };

  if (!manufacturer && !model) {
    return NextResponse.json(
      { error: "Le fabricant ou le modèle est requis" },
      { status: 422 },
    );
  }

  const deviceDesc = [manufacturer, model].filter(Boolean).join(" ");
  const typeHint = type ? ` (type: ${type})` : "";

  // Appel via l'orchestrateur : policy "asset_eol" sensitivity="public"
  // (aucune PII, juste des noms de modèles) → pas de scrub, cloud OK.
  const result = await runAiTask({
    policy: POLICY_ASSET_EOL,
    context: { userId: me.id },
    taskKind: "extraction",
    messages: [
      {
        role: "system",
        content: `Tu es un expert en cycle de vie des équipements informatiques (hardware lifecycle).
L'utilisateur te donne un fabricant et/ou modèle d'appareil. Tu dois retourner:
- endOfSaleDate: la date de fin de vente (EOS) au format YYYY-MM-DD, ou null si inconnue
- endOfLifeDate: la date de fin de vie / fin de support (EOL/EOSL) au format YYYY-MM-DD, ou null si inconnue
- endOfExtendedSupportDate: la date de fin de support étendu au format YYYY-MM-DD, ou null si inconnue
- source: une courte mention de la source (ex: "Bulletin HPE a00123456", "Microsoft Lifecycle", "Estimation basée sur cycle standard fabricant")
- confidence: "high" si tu as des données précises, "medium" si c'est estimé, "low" si très incertain
- notes: un court commentaire en français (1-2 phrases)

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`,
      },
      {
        role: "user",
        content: `Appareil: ${deviceDesc}${typeHint}`,
      },
    ],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error?.reason ?? "Erreur IA" },
      { status: 502 },
    );
  }

  try {
    const parsed = JSON.parse(result.content ?? "");
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Réponse IA invalide", raw: result.content },
      { status: 502 },
    );
  }
}
