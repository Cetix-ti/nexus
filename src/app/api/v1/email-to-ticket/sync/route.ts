import { NextResponse } from "next/server";
import { syncEmailsToTickets } from "@/lib/email-to-ticket/service";

export async function POST() {
  try {
    const result = await syncEmailsToTickets();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { fetched: 0, created: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] },
      { status: 500 },
    );
  }
}
