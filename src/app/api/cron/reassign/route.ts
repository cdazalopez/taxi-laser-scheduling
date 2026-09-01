import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getContactConversation, assignContact, addContactTags } from "@/lib/ghl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reassign poller (run ~every minute via Vercel Cron or an external scheduler).
 * For each open assignment idle >2min where the client's message is still unanswered
 * (last message inbound), reassign the conversation to the next dispatcher in rotation.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or header `x-webhook-secret`.
 */
async function handle(req: NextRequest) {
  const ok =
    (process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) ||
    req.headers.get("x-webhook-secret") === process.env.MAKE_WEBHOOK_SECRET;
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServiceClient();

  // Refresh the live pool first so "active right now" reflects the CURRENT messaging slot.
  // pg_cron only refreshes hourly at minute 0; without this, a reassignment firing right after
  // the hour boundary could pick a dispatcher whose slot just ended (off their round-robin hour).
  await sb.rpc("refresh_pool_activo").then(() => {}, () => {});

  const { data: cfg } = await sb.from("reassign_config").select("*").eq("id", true).single();
  if (cfg && cfg.enabled === false) {
    return NextResponse.json({ ok: true, disabled: true });
  }
  const IDLE_MS = (cfg?.idle_minutes ?? 5) * 60 * 1000;
  const MAX_REASSIGNS = cfg?.max_reassigns ?? 5;
  const REQUIRE_UNREAD = cfg?.require_unread ?? true;

  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  const [{ data: open }, { data: stops }] = await Promise.all([
    sb.from("active_assignments").select("*").lt("assigned_at", cutoff).limit(100),
    sb.from("reassign_stopwords").select("word"),
  ]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const stopwords = (stops ?? []).map((s) => norm(s.word));
  const isClosed = (body: string | null) => {
    if (!body) return false;
    const b = norm(body);
    return stopwords.some((w) => b.includes(w));
  };

  let reassigned = 0, resolved = 0, closed = 0, checked = 0, engaged = 0;
  for (const a of open ?? []) {
    checked++;
    let conv;
    try {
      conv = await getContactConversation(a.contact_id);
    } catch {
      continue; // GHL hiccup — try next tick
    }

    // Dispatcher (or anyone) replied → conversation is being handled. Stop tracking.
    if (conv.lastDirection === "outbound") {
      await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      resolved++;
      continue;
    }

    // Service completed / closing message → stop reassigning.
    if (isClosed(conv.lastBody)) {
      await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      closed++;
      continue;
    }

    // Only reassign when the client is actually waiting (last message inbound).
    if (conv.lastDirection !== "inbound") {
      // No conversation / no messages — drop very stale trackers to avoid buildup.
      if (Date.now() - new Date(a.assigned_at).getTime() > 15 * 60 * 1000)
        await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      continue;
    }

    const idleFrom = Math.max(new Date(a.assigned_at).getTime(), conv.lastDate ?? 0);
    if (Date.now() - idleFrom < IDLE_MS) continue;

    // If the dispatcher already opened/read the conversation, it's THEIRS (sticky):
    // stop tracking it so it's never auto-reassigned again — even if a new inbound
    // arrives and they take a while to reply. Fixes conversations "disappearing" from
    // an agent's My Inbox while they're actively handling them. Round-robin only
    // redistributes conversations the assigned agent has NEVER opened.
    if (REQUIRE_UNREAD && conv.unreadCount === 0) {
      await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      engaged++;
      continue;
    }

    if (a.reassign_count >= MAX_REASSIGNS) {
      await addContactTags(a.contact_id, ["sin_respuesta"]).catch(() => {});
      await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      continue;
    }

    // Mark the current holder as just-assigned so the rotation won't pick them again.
    await sb.from("dispatchers").update({ last_assigned_at: new Date().toISOString() }).eq("id", a.dispatcher_id);
    const { data } = await sb.rpc("assign_next_dispatcher");
    const next = Array.isArray(data) ? data[0] : data;
    if (!next || !next.ghl_user_id || next.dispatcher_id === a.dispatcher_id) continue; // no one else available

    try {
      await assignContact(a.contact_id, next.ghl_user_id);
    } catch {
      continue;
    }

    await sb.from("assignment_log").insert({
      outcome: "reassigned",
      dispatcher_id: next.dispatcher_id,
      reassigned_from: a.dispatcher_id,
      reason: "no_response_2min",
      contact_id: a.contact_id,
      contact_name: a.contact_name,
      channel: a.channel,
    });
    await sb
      .from("active_assignments")
      .update({ dispatcher_id: next.dispatcher_id, assigned_at: new Date().toISOString(), reassign_count: a.reassign_count + 1, updated_at: new Date().toISOString(), conversation_id: conv.conversationId })
      .eq("contact_id", a.contact_id);
    reassigned++;
  }

  return NextResponse.json({ ok: true, checked, reassigned, resolved, closed, engaged });
}

export const POST = handle;
export const GET = handle;
