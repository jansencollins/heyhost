import { NextResponse } from "next/server";

// Returns the server's wall-clock time so clients can compute the offset
// between their device clock and the server. Used by timer UIs to stay in
// sync regardless of individual device clock drift.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ now: Date.now() });
}
