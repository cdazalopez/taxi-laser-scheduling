import { NextRequest, NextResponse } from "next/server";
import { rankReplacements } from "@/lib/replacement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI-assisted replacement suggestions for a shift needing coverage.
 * POST { "shift_id": "<uuid>" }
 *
 * Returns rule-ranked candidates. If ANTHROPIC_API_KEY is configured, it also
 * returns a short natural-language recommendation from Claude (used directly).
 */
export async function POST(req: NextRequest) {
  let shiftId: string | undefined;
  try {
    ({ shift_id: shiftId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!shiftId) return NextResponse.json({ error: "shift_id required" }, { status: 400 });

  let ranked;
  try {
    ranked = await rankReplacements(shiftId);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "ranking failed" }, { status: 500 });
  }

  const top = ranked.candidates.slice(0, 5);
  let recommendation: string | null = null;

  const hasAI = !!process.env.ANTHROPIC_API_KEY;
  if (hasAI && top.length) {
    try {
      const { generateText } = await import("ai");
      const { anthropic } = await import("@ai-sdk/anthropic");
      const s = ranked.shift;
      const { text } = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        prompt:
          `Eres un supervisor de despacho de Taxi Laser LLC. Un turno necesita reemplazo:\n` +
          `Fecha ${s.shift_date}, ${s.shift_start}-${s.shift_end}, puesto: ${s.position ?? "N/A"}.\n` +
          `Titular ausente: ${s.dispatcher?.full_name ?? "N/A"}.\n\n` +
          `Candidatos rankeados por reglas (mayor score = mejor):\n` +
          top
            .map(
              (c, i) =>
                `${i + 1}. ${c.dispatcher.full_name} — score ${c.score}, ${
                  c.available_now ? "disponible ahora" : "no en pool activo"
                }. ${c.reasons.join("; ")}`
            )
            .join("\n") +
          `\n\nRecomienda al mejor reemplazo en 2-3 frases, en español, justificando brevemente.`,
      });
      recommendation = text;
    } catch (e: any) {
      recommendation = null; // gateway optional — fall back to rule ranking silently
    }
  }

  return NextResponse.json({
    shift: ranked.shift,
    candidates: top,
    recommendation,
    ai_enabled: hasAI,
  });
}
