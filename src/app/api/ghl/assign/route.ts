import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { assignContact, addContactTags, getContactAssignedTo } from "@/lib/ghl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GHL numeric message.type → channel label (extend as new channels are seen).
const GHL_TYPE: Record<number, string> = {
  1: "Llamada",
  2: "SMS",
  3: "Email",
  4: "SMS",
  5: "Webchat",
  16: "Facebook",
  17: "Instagram",
  19: "WhatsApp",
  20: "WhatsApp",
  25: "Instagram",
};

function normChannel(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s.includes("whatsapp") || s === "wa") return "WhatsApp";
  if (s.includes("instagram") || s === "ig") return "Instagram";
  if (s.includes("facebook") || s === "fb") return "Facebook";
  if (s.includes("sms") || s.includes("text")) return "SMS";
  if (s.includes("email")) return "Email";
  if (s.includes("call") || s.includes("phone")) return "Llamada";
  if (s.includes("chat") || s.includes("web")) return "Webchat";
  return null;
}

/** Best channel label from a GHL webhook payload. */
function detectChannel(body: any): string | null {
  const type = body.message?.type ?? body.message_type;
  return (
    (typeof type === "number" ? GHL_TYPE[type] : null) ||
    normChannel(body.contact_source) ||
    normChannel(body.message?.type) ||
    normChannel(body.channel) ||
    (type != null ? `Tipo ${type}` : null)
  );
}

/**
 * One-step GHL round-robin. A GHL Workflow ("Customer Replied" → Webhook) POSTs here
 * with the contact. We pick the next active dispatcher AND assign the contact in GHL
 * ourselves — so the Workflow needs no If/Else or Assign action.
 *
 * Auth: header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>`.
 * Body: any GHL webhook payload containing the contact id (contact_id / contactId / id / contact.id).
 *
 * On no active dispatcher: tags the contact `sin_dispatcher_activo` and leaves it unassigned.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const contactId =
    body.contact_id || body.contactId || body.contactID || body.id || body.contact?.id;
  if (!contactId) {
    return NextResponse.json({ error: "missing contact id" }, { status: 400 });
  }

  // Best-effort extraction of contact name + channel from the GHL payload (for the live view).
  const contactName =
    body.full_name ||
    body.contact_name ||
    [body.first_name, body.last_name].filter(Boolean).join(" ") ||
    [body.contact?.firstName, body.contact?.lastName].filter(Boolean).join(" ") ||
    body.contact?.name ||
    null;
  const channel = detectChannel(body);

  const sb = getServiceClient();
  const log = (outcome: string, dispatcher_id: string | null, reason: string | null) =>
    sb
      .from("assignment_log")
      .insert({ outcome, dispatcher_id, reason, contact_id: contactId, contact_name: contactName, channel, raw: body })
      .then(
        () => {},
        () => {}
      );

  // Refresh the live pool first so "active right now" reflects the CURRENT messaging slot,
  // manual offline toggles, and approved leave — never a stale snapshot.
  await sb.rpc("refresh_pool_activo").then(() => {}, () => {});

  // The trigger fires on every inbound message. A contact may already have an owner from a
  // PAST conversation. Keep that owner ONLY if they are active in the pool right now; otherwise
  // (off-shift, manually offline, or off their messaging slot this hour) reassign to an active
  // dispatcher. A returning customer must never stay stuck with someone who can't answer.
  let reassignedFrom: string | null = null;
  try {
    const currentGhl = await getContactAssignedTo(contactId);
    if (currentGhl) {
      const { data: owner } = await sb
        .from("dispatchers")
        .select("id")
        .eq("ghl_user_id", currentGhl)
        .eq("status", "activo")
        .maybeSingle();
      if (owner) {
        const { data: pa } = await sb
          .from("pool_activo")
          .select("is_active")
          .eq("dispatcher_id", owner.id)
          .maybeSingle();
        if (pa?.is_active) {
          // owner is active → keep the relationship, don't burn a rotation slot
          return NextResponse.json(
            { assigned: false, reason: "owner_active", ghl_user_id: currentGhl },
            { status: 200 }
          );
        }
      }
      // owner exists but is inactive right now (or unmapped) → reassign to an active dispatcher
      reassignedFrom = owner?.id ?? null;
    }
  } catch {
    // GHL lookup failed → proceed to assign as a safe default
  }

  const { data, error } = await sb.rpc("assign_next_dispatcher");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : data;

  // No active dispatcher (or chosen one has no GHL mapping) → flag and stop.
  if (!row || !row.ghl_user_id) {
    const reason = !row ? "no_active_dispatcher" : "missing_ghl_user_id";
    try {
      await addContactTags(contactId, ["sin_dispatcher_activo"]);
    } catch (e: any) {
      await log(reason, row?.dispatcher_id ?? null, reason);
      return NextResponse.json({ assigned: false, reason, tag_error: e.message }, { status: 200 });
    }
    await log(reason, row?.dispatcher_id ?? null, reason);
    return NextResponse.json({ assigned: false, reason, tagged: true }, { status: 200 });
  }

  // Assign the conversation to the chosen dispatcher in GHL.
  try {
    await assignContact(contactId, row.ghl_user_id);
  } catch (e: any) {
    await log("assign_error", row.dispatcher_id, e.message);
    return NextResponse.json({ assigned: false, reason: "ghl_assign_error", error: e.message }, { status: 502 });
  }

  // Log as a reassignment (returning customer, owner inactive) or a fresh assignment.
  await sb
    .from("assignment_log")
    .insert({
      outcome: reassignedFrom ? "reassigned" : "assigned",
      dispatcher_id: row.dispatcher_id,
      reassigned_from: reassignedFrom,
      reason: reassignedFrom ? "owner_inactivo_cliente_regreso" : null,
      contact_id: contactId,
      contact_name: contactName,
      channel,
      raw: body,
    })
    .then(() => {}, () => {});
  // Track as an open assignment so the reassign poller can monitor 2-min inactivity.
  await sb
    .from("active_assignments")
    .upsert(
      { contact_id: contactId, dispatcher_id: row.dispatcher_id, assigned_at: new Date().toISOString(), reassign_count: 0, contact_name: contactName, channel, updated_at: new Date().toISOString() },
      { onConflict: "contact_id" }
    )
    .then(() => {}, () => {});
  return NextResponse.json({
    assigned: true,
    contact_id: contactId,
    ghl_user_id: row.ghl_user_id,
    dispatcher_id: row.dispatcher_id,
    full_name: row.full_name,
  });
}
