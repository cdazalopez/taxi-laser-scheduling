import { NextRequest, NextResponse } from "next/server";
import { getStaffingInsights, getScheduledStaffingByHour } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOW_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * AI staffing analysis for a day-of-week.
 * POST { dow: 0-6, target: number }
 * Returns a natural-language analysis from Claude (used directly) if ANTHROPIC_API_KEY is set.
 */
export async function POST(req: NextRequest) {
  let dow = 1,
    target = 15,
    compareDate: string | undefined;
  try {
    ({ dow, target, compareDate } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { rows, samples } = await getStaffingInsights(dow, target);
  if (!samples) {
    return NextResponse.json({ analysis: null, reason: "no_history" }, { status: 200 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ analysis: null, reason: "ai_disabled" }, { status: 200 });
  }

  const scheduled = compareDate ? await getScheduledStaffingByHour(compareDate) : null;

  try {
    const { generateText } = await import("ai");
    const { anthropic } = await import("@ai-sdk/anthropic");
    const table = rows
      .map((r) => {
        const actual = scheduled?.get(r.hour) ?? 0;
        const gapActual = r.recommended - actual;
        return (
          `${String(r.hour).padStart(2, "0")}h: demanda≈${r.avg_demand}, recomendado ${r.recommended}` +
          (scheduled
            ? `, programado esta semana ${actual}, gap ${gapActual > 0 ? "+" + gapActual : gapActual}`
            : `, staff hist≈${r.avg_staff ?? "—"}`)
        );
      })
      .join("\n");

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      prompt:
        `Eres analista de operaciones de Taxi Laser LLC (despacho de taxis). Analiza el staffing de dispatchers ` +
        `para los ${DOW_LABEL[dow]} basado en ${samples} semanas de histórico. Carga objetivo: ${target} llamadas/dispatcher.\n\n` +
        `Recomendado = ceil(demanda/objetivo). ${
          scheduled
            ? "Comparo contra lo REALMENTE programado esta semana; gap positivo = faltan dispatchers en el horario actual."
            : ""
        }\nPor hora:\n${table}\n\n` +
        `Da un análisis accionable en español (máx 6 viñetas): franjas críticas donde el horario actual está sub-staffeado (gap positivo alto), ` +
        `posible sobre-staffing (gap negativo), patrones de demanda del día, y ajustes concretos al horario de esta semana. Sé específico con horas y números.`,
    });
    return NextResponse.json({ analysis: text, samples });
  } catch (e: any) {
    return NextResponse.json({ analysis: null, reason: "ai_error", error: e.message }, { status: 200 });
  }
}
