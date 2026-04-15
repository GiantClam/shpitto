import { ProxyAgent, setGlobalDispatcher } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";

const getProxyUrlFromEnv = () =>
  process.env.PROXY_URL ||
  process.env.ALL_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.all_proxy ||
  process.env.https_proxy ||
  process.env.http_proxy;

const getHttpProxyUrl = () => {
  const proxy = getProxyUrlFromEnv()?.trim();
  if (!proxy) return undefined;

  try {
    const parsed = new URL(proxy);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return proxy;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const configureUndiciProxyFromEnv = () => {
  const proxy = getHttpProxyUrl();
  if (!proxy) return;
  try {
    setGlobalDispatcher(new ProxyAgent(proxy));
  } catch {
    // Ignore invalid proxy values in local shells (e.g. socks5), keep build/runtime resilient.
  }
};

export const createHttpsProxyAgentFromEnv = () => {
  const proxy = getHttpProxyUrl();
  if (!proxy) return undefined;
  try {
    return new HttpsProxyAgent(proxy);
  } catch {
    return undefined;
  }
};

export const isRegionDeniedError = (err: unknown) => {
  const anyErr = err as any;
  const status = anyErr?.status ?? anyErr?.code ?? anyErr?.response?.status;
  const msg = String(anyErr?.message || anyErr?.error?.message || "");
  return Number(status) === 403 && msg.toLowerCase().includes("not available in your region");
};
