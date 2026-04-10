import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurée" },
      { status: 500 },
    );
  }

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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
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
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenAI API error ${res.status}: ${text}` },
      { status: 502 },
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Réponse IA invalide", raw: content },
      { status: 502 },
    );
  }
}
