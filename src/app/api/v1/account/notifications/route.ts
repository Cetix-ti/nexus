// GET / PUT /api/v1/account/notifications
// Préférences de notification de l'agent courant (User).
// Lit/écrit User.preferences.notifications via src/lib/notifications/preferences.ts.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  getUserNotificationPrefs,
  saveUserNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notifications/preferences";
import { EVENTS, EVENT_KEYS } from "@/lib/notifications/events";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await getUserNotificationPrefs(me.id);
  return NextResponse.json({ prefs, catalog: EVENTS });
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<NotificationPrefs>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validation minimale — structure attendue, on ignore les clés inconnues
  // pour que le store ne pollue pas avec d'éventuels vieux événements
  // retirés du catalogue.
  const channels = {
    inApp: !!body.channels?.inApp,
    email: !!body.channels?.email,
  };
  const events: NotificationPrefs["events"] = {};
  if (body.events && typeof body.events === "object") {
    for (const [key, pref] of Object.entries(body.events)) {
      if (!EVENT_KEYS.includes(key as never)) continue; // ignore unknowns
      if (!pref) continue;
      events[key] = { inApp: !!pref.inApp, email: !!pref.email };
    }
  }

  const saved = await saveUserNotificationPrefs(me.id, { channels, events });
  return NextResponse.json({ prefs: saved });
}
