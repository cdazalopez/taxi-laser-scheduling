import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Round-robin assignment for incoming GHL conversations (WhatsApp/SMS).
 *
 * A GHL Workflow (Inbound/Custom Webhook action) calls this when a new message
 * arrives. We pick the next ACTIVE dispatcher in rotation (least-recently-assigned
 * over pool_activo) atomically and return their GHL user id so the Workflow's
 * "Assign to User" action can assign the conversation to them.
 *
 * Auth: header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>`.
 * Method: POST (GHL webhooks POST) — GET also allowed for easy testing.
 *
 * Response always carries a `ghl_user_id` to assign when possible, plus flags so the
 * GHL Workflow can branch:
 *   - active dispatcher: { assigned: true,  fallback: false, ghl_user_id, dispatcher_id, full_name, email }
 *   - nobody active, fallback set: { assigned: false, fallback: true, ghl_user_id, reason }
 *   - nobody active, no fallback:  { assigned: false, fallback: false, reason }
 */
async function handle(req: NextRequest) {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  const provided = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();

  const log = (outcome: string, dispatcher_id: string | null, reason: string | null) =>
    sb.from("assignment_log").insert({ outcome, dispatcher_id, reason }).then(
      () => {},
      () => {} // best-effort logging — never fail the assignment on a log error
    );

  const fallbackId = process.env.GHL_FALLBACK_USER_ID || null;
  const withFallback = async (reason: string) => {
    await log(reason, null, reason);
    return NextResponse.json(
      fallbackId
        ? { assigned: false, fallback: true, ghl_user_id: fallbackId, reason }
        : { assigned: false, fallback: false, reason },
      { status: 200 }
    );
  };

  const { data, error } = await sb.rpc("assign_next_dispatcher");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return withFallback("no_active_dispatcher");
  if (!row.ghl_user_id) return withFallback("missing_ghl_user_id");

  await log("assigned", row.dispatcher_id, null);
  return NextResponse.json({
    assigned: true,
    fallback: false,
    ghl_user_id: row.ghl_user_id,
    dispatcher_id: row.dispatcher_id,
    full_name: row.full_name,
    email: row.email,
  });
}

export const POST = handle;
export const GET = handle;
