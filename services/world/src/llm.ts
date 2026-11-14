import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { repoRoot } from "@listed/db";
import { fetchText } from "./http";

export type Provider = "ai" | "nearai";

export interface LlmSettings {
  provider: Provider;
  baseUrl: string | undefined;
  keyName: "AI_API_KEY" | "NEARAI_API_KEY";
  key: string | undefined;
  modelName: "AI_MODEL_PRIMARY" | "LLM_MODEL_PRIMARY";
  model: string | undefined;
}

function readEnvFile(): Record<string, string> {
  const file = join(repoRoot(), ".env");
  if (!existsSync(file)) return {};
  try {
    return parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function llmSettings(source: { env?: NodeJS.ProcessEnv; file?: Record<string, string> } = {}): LlmSettings {
  const env = source.env ?? process.env;
  const file = source.file ?? readEnvFile();
  const get = (k: string): string | undefined => {
    const v = env[k]?.trim() || file[k]?.trim();
    return v ? v : undefined;
  };
  const raw = (get("LLM_PROVIDER") ?? "ai").toLowerCase();
  if (raw === "nearai" || raw === "near-ai" || raw === "near") {
    return {
      provider: "nearai",
      baseUrl: get("LLM_BASE_URL") ?? "https://cloud-api.near.ai/v1",
      keyName: "NEARAI_API_KEY",
      key: get("NEARAI_API_KEY"),
      modelName: "LLM_MODEL_PRIMARY",
      model: get("LLM_MODEL_PRIMARY"),
    };
  }
  return {
    provider: "ai",
    baseUrl: get("AI_BASE_URL"),
    keyName: "AI_API_KEY",
    key: get("AI_API_KEY"),
    modelName: "AI_MODEL_PRIMARY",
    model: get("AI_MODEL_PRIMARY") ?? get("AI_MODEL_SMALL"),
  };
}

export function llmMissing(s: LlmSettings): string | null {
  if (!s.key) return `${s.keyName} is not set (LLM_PROVIDER=${s.provider})`;
  if (!s.baseUrl) return "AI_BASE_URL is not set";
  if (!s.model) return `${s.modelName} is not set`;
  return null;
}

const endpoint = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path}`;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export async function chat(settings: LlmSettings, messages: ChatMessage[], opts: { timeoutMs: number; fetchImpl?: typeof fetch }): Promise<ChatResult> {
  const missing = llmMissing(settings);
  if (missing) throw new Error(missing);
  const res = await fetchText(endpoint(settings.baseUrl as string, "chat/completions"), {
    method: "POST",
    timeoutMs: opts.timeoutMs,
    retries: 2,
    backoffMs: 3_000,
    headers: { authorization: `Bearer ${settings.key}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ model: settings.model, messages, temperature: 0 }),
    fetchImpl: opts.fetchImpl,
  });
  const body = JSON.parse(res.text) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  let text: string;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) text = content.map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : "")).join("");
  else throw new Error("The model returned no message content");
  return { text, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 };
}
