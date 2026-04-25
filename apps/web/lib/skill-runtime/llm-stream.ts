import { AIMessage, type BaseMessage } from "@langchain/core/messages";

function dedupeToolCalls(calls: any[]): any[] {
  const map = new Map<string, any>();
  for (const call of calls || []) {
    const key = [
      String(call?.id || ""),
      String(call?.name || call?.function?.name || ""),
      String(call?.args || call?.function?.arguments || ""),
    ].join("|");
    if (!map.has(key)) map.set(key, call);
  }
  return Array.from(map.values());
}

function mergeAdditionalKwargs(
  base: Record<string, any> | undefined,
  patch: Record<string, any> | undefined,
): Record<string, any> | undefined {
  if (!base && !patch) return undefined;
  if (!base) return { ...(patch || {}) };
  if (!patch) return { ...base };

  const merged: Record<string, any> = { ...base, ...patch };
  const baseToolCalls = Array.isArray(base.tool_calls) ? base.tool_calls : [];
  const patchToolCalls = Array.isArray(patch.tool_calls) ? patch.tool_calls : [];
  if (baseToolCalls.length > 0 || patchToolCalls.length > 0) {
    merged.tool_calls = dedupeToolCalls([...baseToolCalls, ...patchToolCalls]);
  }
  return merged;
}

export async function invokeModelWithIdleTimeout(params: {
  model: {
    invoke: (messages: BaseMessage[]) => Promise<any>;
    stream?: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<any>>;
  };
  messages: BaseMessage[];
  timeoutMs: number;
  operation: string;
}): Promise<AIMessage> {
  const { model, messages, timeoutMs, operation } = params;
  const idleTimeoutMs = Math.max(1_000, Number(timeoutMs) || 25_000);
  const timeoutErrorText = `Request timed out. [operation=${operation}] [timeoutMs=${idleTimeoutMs}]`;

  const invokeWithAbsoluteTimeout = async (): Promise<AIMessage> =>
    await new Promise<AIMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutErrorText)), idleTimeoutMs);
      model
        .invoke(messages)
        .then((message) => {
          clearTimeout(timer);
          resolve(message as AIMessage);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });

  if (typeof model.stream !== "function") {
    return await invokeWithAbsoluteTimeout();
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort(timeoutErrorText);
      } catch {}
    }, idleTimeoutMs);
  };

  const toChunkText = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };

  const textParts: string[] = [];
  let mergedResponseMeta: Record<string, any> | undefined;
  let mergedAdditional: Record<string, any> | undefined;
  let mergedToolCalls: any[] = [];

  try {
    resetTimer();
    const stream = await model.stream(messages, { signal: controller.signal });
    for await (const chunk of stream as any) {
      // Idle timeout is based on last token/chunk arrival, not initial request time.
      resetTimer();
      const piece = toChunkText((chunk as any)?.content);
      if (piece) textParts.push(piece);
      if ((chunk as any)?.response_metadata) {
        mergedResponseMeta = {
          ...(mergedResponseMeta || {}),
          ...((chunk as any).response_metadata || {}),
        };
      }
      if ((chunk as any)?.additional_kwargs) {
        mergedAdditional = mergeAdditionalKwargs(mergedAdditional, (chunk as any).additional_kwargs);
      }
      if (Array.isArray((chunk as any)?.tool_calls) && (chunk as any).tool_calls.length > 0) {
        mergedToolCalls = dedupeToolCalls([...mergedToolCalls, ...(chunk as any).tool_calls]);
      }
      if (Array.isArray((chunk as any)?.additional_kwargs?.tool_calls) && (chunk as any).additional_kwargs.tool_calls.length > 0) {
        mergedToolCalls = dedupeToolCalls([...mergedToolCalls, ...(chunk as any).additional_kwargs.tool_calls]);
      }
    }
  } catch (error: any) {
    if (timedOut) throw new Error(timeoutErrorText);
    const msg = String(error?.message || error || "");
    if (/aborted|aborterror|signal/i.test(msg) && timedOut) {
      throw new Error(timeoutErrorText);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const messagePayload: any = {
    content: textParts.join(""),
    ...(mergedResponseMeta ? { response_metadata: mergedResponseMeta } : {}),
    ...(mergedAdditional ? { additional_kwargs: mergedAdditional } : {}),
  };
  if (mergedToolCalls.length > 0) {
    messagePayload.tool_calls = mergedToolCalls;
  }
  return new AIMessage(messagePayload);
}
