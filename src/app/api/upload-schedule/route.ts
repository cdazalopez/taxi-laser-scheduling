import { NextRequest, NextResponse } from "next/server";
import { importScheduleFromBuffer } from "@/lib/scheduleParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Upload a schedule .xlsx to load role_schedule. Page-gated: requires the session cookie. */
export async function POST(req: NextRequest) {
  const token = process.env.APP_SESSION_TOKEN;
  if (!token || req.cookies.get("tl_auth")?.value !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "invalid form" }, { status: 400 });
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Falta el archivo .xlsx" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "El archivo debe ser .xlsx" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await importScheduleFromBuffer(buf);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error al procesar" }, { status: 500 });
  }
}
