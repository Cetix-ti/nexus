import { NextResponse } from "next/server";
import { syncVeeamAlerts } from "@/lib/veeam/imap-sync";

export async function POST() {
  try {
    const result = await syncVeeamAlerts();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        fetched: 0,
        newAlerts: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      },
      { status: 500 },
    );
  }
}
