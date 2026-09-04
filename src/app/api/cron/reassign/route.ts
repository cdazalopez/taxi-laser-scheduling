import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getContactConversation, assignContact, addContactTags } from "@/lib/ghl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reassign poller (run ~every minute via Vercel Cron or an external scheduler).
 * For each open assignment idle >idle_minutes where the client's message is still
 * unanswered (last message inbound), reassign the conversation to the next dispatcher.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or header `x-webhook-secret`.
 */
async function handle(req: NextRequest) {
  const ok =
    (process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) ||
    req.headers.get("x-webhook-secret") === process.env.MAKE_WEBHOOK_SECRET;
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServiceClient();

  // Refresh pool every 10 minutes so dispatchers who come online or go offline
  // are reflected within 10 minutes instead of waiting up to 57 minutes.
  const curMin = new Date().getUTCMinutes();
  if (curMin % 10 === 0) await sb.rpc("refresh_pool_activo").then(() => {}, () => {});

  const { data: cfg } = await sb.from("reassign_config").select("*").eq("id", true).single();
  if (cfg && cfg.enabled === false) {
    return NextResponse.json({ ok: true, disabled: true });
  }
  const IDLE_MS = (cfg?.idle_minutes ?? 10) * 60 * 1000;
  const MAX_REASSIGNS = cfg?.max_reassigns ?? 5;
  const REQUIRE_UNREAD = cfg?.require_unread ?? true;
  const BATCH = Number(process.env.REASSIGN_BATCH ?? 25);

  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  // Use updated_at (not assigned_at) so the idle clock resets correctly after
  // each reassignment and after we update the row for any reason.
  const [{ data: open }, { data: stops }] = await Promise.all([
    sb.from("active_assignments").select("*").lt("updated_at", cutoff).order("updated_at", { ascending: true }).limit(BATCH),
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

    // Auto-cleanup: conversations at the ceiling can't be reassigned — tag and remove
    // BEFORE making any GHL call so we don't waste quota on dead conversations.
    // (If the dispatcher already replied, it resolves as "outbound" in the next tick.)
    if (a.reassign_count >= MAX_REASSIGNS) {
      await addContactTags(a.contact_id, ["sin_respuesta"]).catch(() => {});
      await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      continue;
    }

    // Fetch conversation state. On 429, retry once after 1.5s. If still throttled,
    // abort the entire tick — hammering a rate-limited API makes the problem worse.
    let conv: Awaited<ReturnType<typeof getContactConversation>> | undefined;
    try {
      conv = await getContactConversation(a.contact_id);
    } catch (e: any) {
      if (!String(e?.message).includes("429")) { continue; } // non-429 hiccup — skip
      await new Promise(r => setTimeout(r, 1500));
      try {
        conv = await getContactConversation(a.contact_id);
      } catch (e2: any) {
        if (String(e2?.message).includes("429")) {
          return NextResponse.json({ ok: true, checked, reassigned, resolved, closed, engaged, aborted: "ghl_429" });
        }
        continue;
      }
    }
    if (!conv) continue;

    // Store conversation_id on first fetch so future ticks use the right conversation.
    if (conv.conversationId && !a.conversation_id) {
      await sb.from("active_assignments")
        .update({ conversation_id: conv.conversationId, updated_at: new Date().toISOString() })
        .eq("contact_id", a.contact_id)
        .then(() => {}, () => {});
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
      if (Date.now() - new Date(a.updated_at ?? a.assigned_at).getTime() > 15 * 60 * 1000)
        await sb.from("active_assignments").delete().eq("contact_id", a.contact_id);
      continue;
    }

    const idleFrom = Math.max(new Date(a.updated_at ?? a.assigned_at).getTime(), conv.lastDate ?? 0);
    if (Date.now() - idleFrom < IDLE_MS) continue;

    // Dispatcher read the conversation — reset the idle clock ONLY if they are still
    // active in the pool. If they've gone offline, fall through to reassign immediately
    // instead of locking this conversation to an offline dispatcher indefinitely.
    if (REQUIRE_UNREAD && conv.unreadCount === 0) {
      const { data: pa } = await sb
        .from("pool_activo")
        .select("is_active")
        .eq("dispatcher_id", a.dispatcher_id)
        .maybeSingle();
      if (pa?.is_active) {
        await sb.from("active_assignments")
          .update({ updated_at: new Date().toISOString() })
          .eq("contact_id", a.contact_id)
          .then(() => {}, () => {});
        engaged++;
        continue;
      }
      // Dispatcher is offline — fall through to reassignment below
    }

    const { data } = await sb.rpc("assign_next_dispatcher");
    const next = Array.isArray(data) ? data[0] : data;
    if (!next || !next.ghl_user_id || next.dispatcher_id === a.dispatcher_id) continue;

    try {
      await assignContact(a.contact_id, next.ghl_user_id);
    } catch {
      // GHL rejected the assignment — undo the last_assigned_at stamp the RPC set
      // so the rotation isn't skewed by a failed call.
      await sb.from("dispatchers")
        .update({ last_assigned_at: a.dispatcher_id ? new Date(0).toISOString() : null })
        .eq("id", next.dispatcher_id)
        .then(() => {}, () => {});
      continue;
    }

    // Only stamp old dispatcher AFTER GHL confirms — avoids skewing rotation on failure.
    await sb.from("dispatchers")
      .update({ last_assigned_at: new Date().toISOString() })
      .eq("id", a.dispatcher_id);

    await sb.from("assignment_log").insert({
      outcome: "reassigned",
      dispatcher_id: next.dispatcher_id,
      reassigned_from: a.dispatcher_id,
      reason: "no_response",
      contact_id: a.contact_id,
      contact_name: a.contact_name,
      channel: a.channel,
    });
    await sb
      .from("active_assignments")
      .update({
        dispatcher_id: next.dispatcher_id,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reassign_count: a.reassign_count + 1,
        conversation_id: conv.conversationId,
      })
      .eq("contact_id", a.contact_id);
    reassigned++;
  }

  return NextResponse.json({ ok: true, checked, reassigned, resolved, closed, engaged });
}

export const POST = handle;
export const GET = handle;
