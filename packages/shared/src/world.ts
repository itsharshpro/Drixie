import type { Page } from "./types";

export type NewsSentiment = -2 | -1 | 0 | 1 | 2;

export interface NewsItem {
  id: string;
  url: string;
  title: string;

  domain: string;

  source: string;
  snippet: string | null;
  publishedAt: string;

  scored: boolean;
  sentiment: NewsSentiment | null;

  reason: string | null;

  companies: string[];

  services: string[];
}

export type NewsPage = Page<NewsItem>;

export interface AiUsageRecord {

  service?: string;

  company?: string | null;

  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;

  totalTokens?: number;
  latencyMs?: number | null;

  costUsd?: number;
  ok?: boolean;
  error?: string | null;

  requestId?: string | null;
  at?: string;
}

export interface AiBudget {
  dailyUsd: number | null;
  todayUsd: number;
  remainingUsd: number | null;

  exceeded: boolean;
  resetsAt: string;
}
