import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual/backup trigger to recompute pool_activo from the schedule now.
 * The hourly refresh runs inside Supabase via pg_cron ('refresh-pool-activo');
 * this endpoint lets you refresh on demand (e.g. right after editing the schedule).
 *
 * Auth: header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>`,
 * or Vercel Cron's `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: NextRequest) {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const hdr = req.headers.get("x-webhook-secret");
  const auth = req.headers.get("authorization");
  const ok =
    (secret && hdr === secret) ||
    (cronSecret && auth === `Bearer ${cronSecret}`);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const { data, error } = await sb.rpc("refresh_pool_activo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, active: data });
}

export const POST = handle;
export const GET = handle;
