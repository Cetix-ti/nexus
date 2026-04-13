import { NextResponse } from "next/server";
import { suggestCategory, saveCategoryFeedback } from "@/lib/ai/service";
import { getCurrentUser } from "@/lib/auth-utils";

/** POST — suggest category for a ticket */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { subject, description, action, suggestedCategory, confirmedCategory } =
      await req.json();

    // Feedback action — save the agent's confirmation
    if (action === "feedback") {
      if (!subject || !confirmedCategory) {
        return NextResponse.json({ error: "subject and confirmedCategory required" }, { status: 422 });
      }
      await saveCategoryFeedback(subject, description ?? "", suggestedCategory ?? "", confirmedCategory);
      return NextResponse.json({ ok: true });
    }

    // Suggest action — get AI suggestion
    if (!subject) {
      return NextResponse.json({ error: "subject required" }, { status: 422 });
    }

    const suggestion = await suggestCategory(subject, description ?? "");
    return NextResponse.json(suggestion);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur IA" },
      { status: 500 },
    );
  }
}
