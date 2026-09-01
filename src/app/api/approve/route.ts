import { NextRequest, NextResponse } from "next/server";
import { approveRun } from "@/lib/approveRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Approve a generated run → write to schedule + role_schedule. Page-gated (session cookie). */
export async function POST(req: NextRequest) {
  const token = process.env.APP_SESSION_TOKEN;
  if (!token || req.cookies.get("tl_auth")?.value !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let runId = "";
  try {
    ({ runId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  try {
    const result = await approveRun(runId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "approve failed" }, { status: 500 });
  }
}
