import { NextRequest, NextResponse } from "next/server";
import { generateRoles } from "@/lib/roleGenerator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trigger a schedule generation. POST { week_start: "YYYY-MM-DD", days_off?: number }.
 *  Page-gated by the proxy; also accepts the shared secret for external calls. */
export async function POST(req: NextRequest) {
  // Only logged-in users (session cookie) or the shared secret may generate.
  const token = process.env.APP_SESSION_TOKEN;
  const authed =
    (token && req.cookies.get("tl_auth")?.value === token) ||
    req.headers.get("x-webhook-secret") === process.env.MAKE_WEBHOOK_SECRET;
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let week_start = "";
  let days_off = 2;
  let max_msg = 6;
  try {
    ({ week_start, days_off = 2, max_msg = 6 } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: "week_start (Monday, YYYY-MM-DD) required" }, { status: 400 });
  }
  try {
    const result = await generateRoles(week_start, Number(days_off) || 2, Number(max_msg) || 6);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "generation failed" }, { status: 500 });
  }
}
