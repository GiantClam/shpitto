/**
 * LLM Executor - Execute LLM calls for component generation
 */

export interface LLMResponse {
  content: string;
  raw?: any;
}

export interface ExecuteLLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonRetries?: number;
}

const DEFAULT_MODEL = process.env.LLM_MODEL || process.env.LLM_MODEL_PPTOKEN || process.env.PPTOKEN_MODEL || 'gpt-5.4-mini';

let anthropicClient: any = null;
let anthropicClientKey = '';

type ProviderConfig = {
  provider: string;
  apiKey: string;
  baseURL?: string;
};

function getOrderedProviderConfigs(): ProviderConfig[] {
  const order = String(process.env.LLM_PROVIDER_ORDER || 'pptoken,aiberm,crazyrouter')
    .split(',')
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  const unique = order.filter((provider, index) => order.indexOf(provider) === index);
  return unique.flatMap((provider) => {
    if (provider === 'pptoken' && process.env.PPTOKEN_API_KEY) {
      return [{
        provider,
        apiKey: process.env.PPTOKEN_API_KEY,
        baseURL: process.env.PPTOKEN_BASE_URL || process.env.LLM_BASE_URL || 'https://api.pptoken.org/v1',
      }];
    }
    if (provider === 'aiberm' && process.env.AIBERM_API_KEY) {
      return [{
        provider,
        apiKey: process.env.AIBERM_API_KEY,
        baseURL: process.env.AIBERM_BASE_URL || process.env.LLM_BASE_URL || 'https://aiberm.com/v1',
      }];
    }
    if ((provider === 'crazyrouter' || provider === 'crazyroute' || provider === 'crazyreoute') &&
        (process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY)) {
      return [{
        provider: 'crazyroute',
        apiKey: process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY || '',
        baseURL:
          process.env.CRAZYROUTE_BASE_URL ||
          process.env.CRAZYROUTER_BASE_URL ||
          process.env.CRAZYREOUTE_BASE_URL ||
          process.env.LLM_BASE_URL ||
          'https://crazyrouter.com/v1',
      }];
    }
    return [];
  });
}

async function getAnthropicClient(config: ProviderConfig) {
  const cacheKey = `${config.provider}|${config.baseURL || ''}|${config.apiKey}`;
  if (anthropicClient && anthropicClientKey === cacheKey) return anthropicClient;

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    if (!config.apiKey) {
      throw new Error('No API key found. Set PPTOKEN_API_KEY, AIBERM_API_KEY, or CRAZYROUTE_API_KEY');
    }

    anthropicClient = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    anthropicClientKey = cacheKey;
    return anthropicClient;
  } catch (error) {
    throw new Error(`Failed to initialize LLM client: ${error}`);
  }
}

/**
 * Execute an LLM call with the given prompt and system context
 */
export async function executeLLM(
  prompt: string,
  systemContext: string = '',
  options: ExecuteLLMOptions = {}
): Promise<LLMResponse> {
  const { model = DEFAULT_MODEL, maxTokens = 4096, temperature = 0.7 } = options;
  const system = systemContext.trim();
  const messages = [{ role: 'user' as const, content: prompt }];
  const providers = getOrderedProviderConfigs();
  if (providers.length === 0) {
    throw new Error('No API key found. Set PPTOKEN_API_KEY, AIBERM_API_KEY, or CRAZYROUTE_API_KEY');
  }
  let lastError: Error | undefined;
  for (const config of providers) {
    try {
      const client = await getAnthropicClient(config);
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages,
      });

      const textContent = response.content.find((c: any) => c.type === 'text');
      return {
        content: textContent?.type === 'text' ? textContent.text : '',
        raw: response,
      };
    } catch (error: any) {
      lastError = new Error(`LLM call failed (${config.provider}): ${error.message}`);
    }
  }
  throw lastError || new Error('LLM call failed');
}

function parseFirstValidJson(content: string): any {
  const text = content.trim();
  if (!text) {
    throw new Error('Empty response');
  }

  const direct = tryParseJson(text);
  if (direct.ok) {
    return direct.value;
  }

  for (const candidate of extractFencedCodeBlocks(text)) {
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  for (const candidate of extractBalancedJsonBlocks(text)) {
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  throw new Error('No valid JSON object/array found in response');
}

function tryParseJson(input: string): { ok: true; value: any } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false };
  }
}

function extractFencedCodeBlocks(input: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = regex.exec(input);
  while (match) {
    const candidate = match[1]?.trim();
    if (candidate) blocks.push(candidate);
    match = regex.exec(input);
  }
  return blocks;
}

function extractBalancedJsonBlocks(input: string): string[] {
  const candidates: string[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (!escaped && ch === '\\') {
        escaped = true;
        continue;
      }
      if (!escaped && ch === '"') {
        inString = false;
      }
      escaped = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      escaped = false;
      continue;
    }

    if (ch === '{' || ch === '[') {
      if (stack.length === 0) start = i;
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      if ((ch === '}' && last !== '{') || (ch === ']' && last !== '[')) {
        stack.length = 0;
        start = -1;
        continue;
      }
      stack.pop();
      if (stack.length === 0 && start >= 0) {
        const candidate = input.slice(start, i + 1).trim();
        if (candidate) candidates.push(candidate);
        start = -1;
      }
    }
  }

  return candidates;
}

/**
 * Execute LLM with JSON output expectation
 */
export async function executeLLMJSON<T = any>(
  prompt: string,
  systemContext: string = '',
  options: ExecuteLLMOptions = {}
): Promise<T> {
  const jsonRetries = Math.max(0, options.jsonRetries ?? 1);
  const enhancedSystemContext = `${systemContext}\n\nIMPORTANT: Respond with valid JSON only. No markdown fences and no explanation text.`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= jsonRetries; attempt += 1) {
    const response = await executeLLM(prompt, enhancedSystemContext, {
      ...options,
      maxTokens: options.maxTokens || 2048,
      temperature: attempt > 0 ? 0 : options.temperature,
    });

    try {
      return parseFirstValidJson(response.content) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Failed to parse JSON response after ${jsonRetries + 1} attempt(s): ${String(lastError)}`
  );
}

/**
 * Generate component code using the design spec and requirements
 */
export async function generateComponent(
  requirements: string,
  designContext: string,
  componentType: string
): Promise<string> {
  const systemPrompt = `You are an expert React/Next.js component generator.
You generate pixel-perfect UI components based on design system specifications.

Rules:
1. Use TypeScript with 'use client' directive
2. Use Tailwind CSS classes for styling
3. Follow the design system colors, typography, and spacing exactly
4. Generate complete, production-ready component code
5. Do NOT use hardcoded colors - use design tokens
6. Use semantic HTML elements
7. Include proper accessibility attributes

Output ONLY the component code, no explanations.`;

  const userPrompt = `Generate a ${componentType} component for a website.

## Requirements
${requirements}

## Design Context
${designContext}

Generate the complete React component code now.`;

  const response = await executeLLM(userPrompt, systemPrompt, {
    maxTokens: 8192,
    temperature: 0.5,
  });

  return response.content;
}
