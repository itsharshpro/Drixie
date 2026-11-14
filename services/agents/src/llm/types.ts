export type AiFeature =
  | "job"
  | "qa"
  | "moderation"
  | "self_review"
  | "price_reason"
  | "letter"
  | "earnings_call"
  | "bid_pitch"
  | "fund"
  | "other";

export const JOB_FEATURES: ReadonlySet<AiFeature> = new Set(["job", "qa", "moderation", "self_review", "fund"]);

export interface ChatRequest {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;

  feature?: AiFeature;

  company?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;

  thinkingTokens?: number;

  totalTokens?: number;
}

export interface ChatResult {
  text: string; // reasoning blocks already stripped
  chatId: string; // completion id (NEAR AI Cloud uses it for the signature lookup)
  model: string;
  usage: TokenUsage;
  latencyMs?: number;
}

export interface Llm {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export function billedTokens(u: TokenUsage): number {
  return u.totalTokens ?? u.promptTokens + u.completionTokens + (u.thinkingTokens ?? 0);
}

export class UsageMeter {
  readonly calls: { model: string; usage: TokenUsage; chatId: string }[] = [];

  record(r: ChatResult): ChatResult {
    this.calls.push({ model: r.model, usage: r.usage, chatId: r.chatId });
    return r;
  }

  totalTokens(): number {
    return this.calls.reduce((s, c) => s + billedTokens(c.usage), 0);
  }
}
