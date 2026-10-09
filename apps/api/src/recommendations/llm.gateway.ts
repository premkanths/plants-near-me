import { Logger } from '@nestjs/common';

export interface ExplainRequest {
  /** One line describing the shopper, e.g. "buys low-water indoor plants around ₹450". */
  shopper: string;
  items: { id: string; plant: string; facts: string[] }[];
}

/**
 * Optional LLM layer over the rule engine.
 *
 * Step 12 is "rule-based, then LLM": the rules decide *what* is recommended
 * and the model only rewrites the *why* into one friendly line. That ordering
 * is deliberate — a hallucinated ranking would surface out-of-stock or
 * irrelevant plants, whereas a hallucinated sentence is cosmetic and is
 * discarded if it does not parse.
 */
export abstract class LlmGateway {
  abstract readonly available: boolean;
  /** Returns id → blurb. Never throws; returns an empty map when unavailable. */
  abstract explain(request: ExplainRequest): Promise<Map<string, string>>;
}

/** Used whenever no API key is configured — the app runs fully offline. */
export class NullLlmGateway extends LlmGateway {
  readonly available = false;

  explain(): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

export class OpenAiLlmGateway extends LlmGateway {
  readonly available = true;
  private readonly logger = new Logger(OpenAiLlmGateway.name);

  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly timeoutMs = 6000,
  ) {
    super();
  }

  async explain(request: ExplainRequest): Promise<Map<string, string>> {
    const prompt = [
      'You write one-line reasons for plant recommendations on an Indian marketplace.',
      `Shopper: ${request.shopper}`,
      'For each item, write at most 12 words, warm and concrete, using only the facts given.',
      'Never invent prices, ratings or availability.',
      'Reply with JSON: {"items":[{"id":"...","reason":"..."}]}',
      '',
      ...request.items.map(
        (item) => `- id=${item.id} plant=${item.plant} facts=${item.facts.join('; ')}`,
      ),
    ].join('\n');

    // A slow model must never hold up the page; the rule-based reasons are
    // already good enough to ship on their own.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`LLM call failed (${response.status}); using rule-based reasons`);
        return new Map();
      }

      const body = (await response.json()) as ChatResponse;
      return parseExplanations(body.choices?.[0]?.message?.content ?? '');
    } catch (error) {
      this.logger.warn(
        `LLM call errored (${error instanceof Error ? error.message : 'unknown'}); using rule-based reasons`,
      );
      return new Map();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Tolerant parser: anything unexpected yields an empty map, and the caller
 * falls back to the rule-based reason rather than showing the customer junk.
 */
export function parseExplanations(content: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!content.trim()) return result;

  try {
    const parsed: unknown = JSON.parse(content);
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) return result;

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const { id, reason } = item as { id?: unknown; reason?: unknown };
      if (typeof id !== 'string' || typeof reason !== 'string') continue;

      const clean = reason.trim().replace(/\s+/g, ' ').slice(0, 120);
      if (clean) result.set(id, clean);
    }
  } catch {
    return new Map();
  }

  return result;
}
