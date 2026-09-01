import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Make.com hourly pool update.
 *
 * Auth: send header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>`.
 *
 * Body (JSON), either shape is accepted:
 *   { "pool": [ { "dispatcher_id"|"email"|"external_ref": ..., "is_active": true, "current_status": "online" }, ... ] }
 * or a bare array of those objects.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const items: any[] = Array.isArray(body) ? body : (body as any)?.pool;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "expected `pool` array" }, { status: 400 });
  }

  const sb = getServiceClient();

  // Resolve dispatcher ids from email / external_ref when id is not supplied.
  const needLookup = items.filter((i) => !i.dispatcher_id && (i.email || i.external_ref));
  const idByEmail = new Map<string, string>();
  const idByRef = new Map<string, string>();
  if (needLookup.length) {
    const emails = needLookup.map((i) => i.email).filter(Boolean);
    const refs = needLookup.map((i) => i.external_ref).filter(Boolean);
    const { data: disp } = await sb
      .from("dispatchers")
      .select("id, email, external_ref")
      .or(
        [
          emails.length ? `email.in.(${emails.join(",")})` : null,
          refs.length ? `external_ref.in.(${refs.join(",")})` : null,
        ]
          .filter(Boolean)
          .join(",")
      );
    for (const d of disp ?? []) {
      if (d.email) idByEmail.set(d.email, d.id);
      if (d.external_ref) idByRef.set(d.external_ref, d.id);
    }
  }

  const now = new Date().toISOString();
  const rows = items
    .map((i) => {
      const id =
        i.dispatcher_id ||
        (i.email && idByEmail.get(i.email)) ||
        (i.external_ref && idByRef.get(i.external_ref));
      if (!id) return null;
      return {
        dispatcher_id: id,
        is_active: i.is_active ?? i.active ?? false,
        current_status: i.current_status ?? i.status ?? null,
        source: "make.com",
        updated_at: now,
      };
    })
    .filter(Boolean) as any[];

  if (!rows.length) {
    return NextResponse.json({ error: "no resolvable dispatchers", received: items.length }, { status: 422 });
  }

  const { error } = await sb.from("pool_activo").upsert(rows, { onConflict: "dispatcher_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length, skipped: items.length - rows.length });
}
