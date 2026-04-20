import { AIMessage, type BaseMessage } from "@langchain/core/messages";

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
  let lastResponseMeta: Record<string, any> | undefined;
  let lastAdditional: Record<string, any> | undefined;

  try {
    resetTimer();
    const stream = await model.stream(messages, { signal: controller.signal });
    for await (const chunk of stream as any) {
      // Idle timeout is based on last token/chunk arrival, not initial request time.
      resetTimer();
      const piece = toChunkText((chunk as any)?.content);
      if (piece) textParts.push(piece);
      if ((chunk as any)?.response_metadata) {
        lastResponseMeta = (chunk as any).response_metadata;
      }
      if ((chunk as any)?.additional_kwargs) {
        lastAdditional = (chunk as any).additional_kwargs;
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

  return new AIMessage({
    content: textParts.join(""),
    ...(lastResponseMeta ? { response_metadata: lastResponseMeta } : {}),
    ...(lastAdditional ? { additional_kwargs: lastAdditional } : {}),
  });
}

