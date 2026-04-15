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
}

const DEFAULT_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'aiberm';

let anthropicClient: any = null;
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

async function getAnthropicClient() {
  if (anthropicClient) return anthropicClient;
  
  try {
    const { default: Anthropic } = await dynamicImport("@anthropic-ai/sdk");
    
    const apiKey = process.env.ANTHROPIC_API_KEY || 
                    process.env.ANTHROPIC_KEY ||
                    process.env.AIBERM_API_KEY ||
                    process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('No API key found. Set ANTHROPIC_API_KEY or AIBERM_API_KEY');
    }
    
    anthropicClient = new Anthropic({ apiKey });
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

  const client = await getAnthropicClient();

  const messages: any[] = [];
  
  if (systemContext) {
    messages.push({ role: 'system', content: systemContext });
  }
  
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    
    return {
      content: textContent?.type === 'text' ? textContent.text : '',
      raw: response,
    };
  } catch (error: any) {
    throw new Error(`LLM call failed: ${error.message}`);
  }
}

/**
 * Execute LLM with JSON output expectation
 */
export async function executeLLMJSON<T = any>(
  prompt: string,
  systemContext: string = '',
  options: ExecuteLLMOptions = {}
): Promise<T> {
  const enhancedSystemContext = `${systemContext}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.`;
  
  const response = await executeLLM(prompt, enhancedSystemContext, {
    ...options,
    maxTokens: options.maxTokens || 2048,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response.content);
  } catch (e) {
    throw new Error(`Failed to parse JSON response: ${response.content}`);
  }
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
