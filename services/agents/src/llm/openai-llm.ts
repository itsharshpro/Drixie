import OpenAI from "openai";
import { stripReasoning } from "./text.js";
import type { ChatRequest, ChatResult, Llm, TokenUsage } from "./types.js";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
}

export function usageFrom(u: RawUsage | undefined | null): TokenUsage {
  const prompt = u?.prompt_tokens ?? 0;
  const completion = u?.completion_tokens ?? 0;
  const reported = u?.completion_tokens_details?.reasoning_tokens;
  const beyond = u?.total_tokens !== undefined ? Math.max(0, u.total_tokens - prompt - completion) : 0;
  const thinking = reported ?? beyond;
  const total = Math.max(u?.total_tokens ?? 0, prompt + completion + (reported === undefined ? beyond : 0));
  return { promptTokens: prompt, completionTokens: completion, thinkingTokens: thinking, totalTokens: total };
}

export class OpenAiLlm implements Llm {
  private readonly client: OpenAI;

  private readonly noReasoningEffort = new Set<string>();

  constructor(
    baseURL: string,
    apiKey: string,
    timeoutMs: number,
    private readonly opts: { thinkingTokens?: number; fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    this.client = new OpenAI({ baseURL, apiKey, timeout: timeoutMs, maxRetries: opts.maxRetries ?? 2, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    try {
      const res = await this.create(req);
      const choice = res.choices[0];
      const raw = choice?.message?.content ?? "";
      return {
        text: stripReasoning(raw),
        chatId: res.id,
        model: res.model || req.model,
        usage: usageFrom(res.usage as RawUsage | undefined),
        latencyMs: Date.now() - started,
      };
    } catch (e) {

      if (e instanceof OpenAI.APIError) {
        const retryable = e.status === undefined || e.status === 429 || e.status >= 500;
        throw new LlmError(`AI call failed (HTTP ${e.status ?? "?"})`, retryable);
      }
      throw new LlmError(`AI call failed (${(e as Error).name || "network error"})`, true);
    }
  }

  private async create(req: ChatRequest) {
    const effort = Boolean(this.opts.thinkingTokens) && !this.noReasoningEffort.has(req.model);
    const body = {
      model: req.model,
      messages: [
        { role: "system" as const, content: req.system },
        { role: "user" as const, content: req.user },
      ],
      max_tokens: (req.maxTokens ?? 2048) + (this.opts.thinkingTokens ?? 0),
      temperature: req.temperature ?? 0.3,
      stream: false as const,
    };
    try {
      return await this.client.chat.completions.create(effort ? { ...body, reasoning_effort: "low" as const } : body);
    } catch (e) {
      if (!(effort && e instanceof OpenAI.APIError && e.status === 400)) throw e;
      const res = await this.client.chat.completions.create(body);
      this.noReasoningEffort.add(req.model);
      return res;
    }
  }
}
