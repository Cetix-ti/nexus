// ============================================================================
// Widget AI Assistant — génère la config d'un widget à partir d'un prompt en
// langage naturel. L'IA peut poser des questions de clarification si
// l'intention n'est pas claire.
//
// Protocole de sortie JSON strict :
//   { "action": "ask", "message": "question à poser" }
//   OU
//   { "action": "create", "message": "explication", "widget": { config } }
//
// Le serveur valide la config générée contre les métadonnées DATASETS et
// retourne une erreur si invalide (le caller peut itérer avec l'IA pour
// corriger).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { chatCompletion } from "@/lib/ai/service";
import { DATASETS, type DatasetDef, type FieldDef } from "../query/route";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface WidgetConfig {
  name: string;
  description?: string;
  chartType: string;
  color?: string;
  query: {
    dataset: string;
    filters: Array<{ field: string; operator: string; value: string }>;
    groupBy: string;
    aggregate: string;
    aggregateField: string;
    sortBy: string;
    sortDir: string;
    limit: number;
    dateField: string;
    dateFrom: string;
    dateTo: string;
  };
}

const CHART_TYPES = [
  "number", "progress", "gauge", "bar", "horizontal_bar", "stacked_bar",
  "line", "area", "combo", "pie", "donut", "funnel", "treemap", "heatmap",
  "scatter", "radar", "sankey", "table", "list",
];
const AGGREGATES = ["count", "count_distinct", "sum", "avg", "min", "max", "median", "percentage"];
const OPERATORS = ["eq", "neq", "gt", "lt", "gte", "lte", "in", "contains", "isnull", "between"];

function buildSystemPrompt(): string {
  // Expose la liste des datasets et leurs champs à l'IA.
  const datasetsDesc = Object.entries(DATASETS).map(([dsId, ds]) => {
    const fields = ds.fields.map((f) => {
      const parts = [`${f.name} (${f.type})`];
      if (f.groupable) parts.push("groupable");
      if (f.aggregable) parts.push("aggregable");
      if (f.values && f.values.length > 0) parts.push(`valeurs: [${f.values.slice(0, 8).join(", ")}${f.values.length > 8 ? "…" : ""}]`);
      return `    - ${parts.join(", ")}`;
    }).join("\n");
    return `  ${dsId}:\n${fields}`;
  }).join("\n");

  return `Tu es un assistant de création de widgets analytiques pour Nexus (plateforme ITSM pour MSP).

Ton rôle : discuter avec l'utilisateur en français pour comprendre son besoin analytique, puis générer la configuration d'un widget que la UI pourra appliquer directement.

## Datasets disponibles
${datasetsDesc}

## Chart types disponibles
${CHART_TYPES.join(", ")}

## Agrégations disponibles
${AGGREGATES.join(", ")}

## Opérateurs de filtre disponibles
${OPERATORS.join(", ")}

## Règles importantes
- Le champ \`groupBy\` doit être un nom de champ marqué "groupable" dans le dataset choisi.
- Le champ \`aggregateField\` doit être un nom de champ marqué "aggregable" (ou vide si aggregate = count).
- Pour un groupBy de date, tu peux ajouter un suffixe de bucket : \`_by_day\`, \`_by_week\`, \`_by_month\`, \`_by_quarter\`, \`_by_year\`. Exemple : \`startedAt_by_month\`.
- Les filtres sur un champ boolean ont valeur "true" ou "false" (en string).
- Les filtres sur un champ enum doivent utiliser une des valeurs listées.
- \`sortBy\` peut être "value", "label", ou "chronological" (uniquement si groupBy est un bucket date).
- \`sortDir\` = "asc" ou "desc".
- Si l'utilisateur veut le total simple d'un métrique → chartType: "number", pas de groupBy.
- Si l'utilisateur veut voir l'évolution dans le temps → line/area + groupBy avec bucket date.
- Si l'utilisateur veut comparer des catégories → bar/horizontal_bar/pie/donut + groupBy sur un enum.
- Choisis une couleur appropriée : #2563eb (bleu neutre), #059669 (vert performance), #d97706 (orange déplacement), #dc2626 (rouge alerte), #7c3aed (violet analytique).

## Protocole de réponse
Tu réponds UNIQUEMENT en JSON valide au format suivant :

Si tu as besoin de plus d'informations pour créer le widget (ex: l'utilisateur dit "les tickets" mais ne précise pas la métrique) :
\`\`\`json
{
  "action": "ask",
  "message": "Question claire et ciblée, avec exemples concrets"
}
\`\`\`

Si tu as assez d'informations pour créer le widget :
\`\`\`json
{
  "action": "create",
  "message": "Explication courte et amicale de ce que le widget va montrer",
  "widget": {
    "name": "Titre court du widget",
    "description": "Description 1 phrase",
    "chartType": "number|bar|...",
    "color": "#2563eb",
    "query": {
      "dataset": "tickets|time_entries|...",
      "filters": [{"field": "...", "operator": "eq", "value": "..."}],
      "groupBy": "",
      "aggregate": "count",
      "aggregateField": "",
      "sortBy": "value",
      "sortDir": "desc",
      "limit": 20,
      "dateField": "",
      "dateFrom": "",
      "dateTo": ""
    }
  }
}
\`\`\`

## Exemples

User: "Combien de déplacements j'ai facturés ?"
Réponse:
{"action":"create","message":"Voici un KPI qui compte toutes les saisies de temps où le déplacement a été facturé.","widget":{"name":"Déplacements facturés","description":"Nombre total","chartType":"number","color":"#d97706","query":{"dataset":"time_entries","filters":[{"field":"hasTravelBilled","operator":"eq","value":"true"}],"groupBy":"","aggregate":"count","aggregateField":"","sortBy":"value","sortDir":"desc","limit":20,"dateField":"startedAt","dateFrom":"","dateTo":""}}}

User: "Les tickets"
Réponse:
{"action":"ask","message":"Qu'est-ce que tu veux voir sur les tickets ? Par exemple : le nombre total, la répartition par statut, l'évolution dans le temps, par priorité, par client ?"}

## Contraintes
- Ne réponds qu'avec le JSON, rien d'autre. Pas de markdown, pas de commentaire.
- Si l'utilisateur pose une question hors sujet, réponds avec {"action":"ask","message":"..."} et remets-le dans le contexte.
- Si tu crées un widget, son \`name\` doit être court (≤ 40 car) et explicite.`;
}

function extractJson(text: string): unknown | null {
  // L'IA peut entourer le JSON de markdown. Extrait-le.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    // Cherche un { ... } balancé.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}

function validateWidget(cfg: WidgetConfig): { ok: true } | { ok: false; reason: string } {
  if (!cfg?.query?.dataset) return { ok: false, reason: "dataset manquant" };
  const ds = DATASETS[cfg.query.dataset];
  if (!ds) return { ok: false, reason: `dataset inconnu : ${cfg.query.dataset}` };

  const fieldNames = new Set(ds.fields.map((f) => f.name));
  // groupBy peut avoir un bucket suffix (_by_day, _by_month, etc.)
  const groupByBase = (cfg.query.groupBy || "").replace(/_by_(day|week|month|quarter|year)$/, "");
  if (groupByBase && !fieldNames.has(groupByBase)) {
    return { ok: false, reason: `groupBy inconnu : ${groupByBase}` };
  }

  if (cfg.query.aggregateField && !fieldNames.has(cfg.query.aggregateField)) {
    return { ok: false, reason: `aggregateField inconnu : ${cfg.query.aggregateField}` };
  }
  if (!AGGREGATES.includes(cfg.query.aggregate)) {
    return { ok: false, reason: `aggregate invalide : ${cfg.query.aggregate}` };
  }
  if (!CHART_TYPES.includes(cfg.chartType)) {
    return { ok: false, reason: `chartType invalide : ${cfg.chartType}` };
  }
  for (const f of cfg.query.filters ?? []) {
    if (!fieldNames.has(f.field)) return { ok: false, reason: `filtre: field inconnu : ${f.field}` };
    if (!OPERATORS.includes(f.operator)) return { ok: false, reason: `filtre: operator invalide : ${f.operator}` };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const messages: Message[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Messages requis, le dernier doit être role=user" }, { status: 400 });
  }

  try {
    const systemPrompt = buildSystemPrompt();
    const aiMessages: Message[] = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
    ];
    const text = await chatCompletion(aiMessages, { temperature: 0.3, maxTokens: 2000 });
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({
        action: "ask",
        message: "Désolé, je n'ai pas compris. Peux-tu reformuler ta demande ?",
        rawResponse: text.slice(0, 500),
      });
    }
    const response = parsed as { action?: string; message?: string; widget?: WidgetConfig };

    if (response.action === "create" && response.widget) {
      const v = validateWidget(response.widget);
      if (!v.ok) {
        return NextResponse.json({
          action: "ask",
          message: `J'ai essayé de créer ce widget mais il y a un problème : ${v.reason}. Peux-tu préciser ?`,
          invalidWidget: response.widget,
        });
      }
      return NextResponse.json({
        action: "create",
        message: response.message ?? "Voici le widget.",
        widget: response.widget,
      });
    }

    if (response.action === "ask" && response.message) {
      return NextResponse.json({ action: "ask", message: response.message });
    }

    return NextResponse.json({
      action: "ask",
      message: "Je n'ai pas compris, peux-tu reformuler ?",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: `AI call failed: ${msg}` }, { status: 500 });
  }
}
