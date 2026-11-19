/**
 * 1.1: the Claude call (official SDK, structured output, effort "low", server-side refusal fallback).
 * Loaded lazily by ai.ts so the SDK is not evaluated on cold starts that never need it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_CONFIG, AI_MAX_QUERY, AI_MAX_TERMS, AI_MODEL, SYSTEM_PROMPT, logSkip, type RewriteResult } from "./ai";
import type { Env } from "./env";

export const RewriteSchema = z.object({
  terms: z.array(z.string().min(1).max(60)).min(1).max(AI_MAX_TERMS),
  confidence: z.enum(["high", "medium", "low"]),
});

/** Clean the model's terms: trimmed, non-empty, ≤ 60 chars, distinct, ≤ 5. */
export function sanitise(terms: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of terms) {
    const s = t.replace(/\s+/g, " ").trim().slice(0, 60);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= AI_MAX_TERMS) break;
  }
  return out;
}

/** One Claude call. Exported for tests; production goes through aiRewrite(). */
export async function callClaude(env: Env, query: string): Promise<RewriteResult> {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: AI_CONFIG.timeoutMs,
    maxRetries: 0,
    // Resolve fetch at call time (Workers global; lets tests stub it).
    fetch: (input, init) => fetch(input, init),
  });
  try {
    const res = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: query.trim().slice(0, AI_MAX_QUERY) }],
      output_config: { effort: "low", format: betaZodOutputFormat(RewriteSchema) },
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return { ok: false, reason: "no_output" };
    const terms = sanitise(res.parsed_output.terms);
    if (!terms.length) return { ok: false, reason: "no_output" };
    return { ok: true, terms, confidence: res.parsed_output.confidence, cached: false };
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "timeout" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "api_rate_limited" };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: "connection" };
    if (err instanceof Anthropic.APIError) {
      logSkip("api_error", err.status);
      return { ok: false, reason: "api_error" };
    }
    return { ok: false, reason: "error" };
  }
}

