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

export const configureUndiciProxyFromEnv = () => {
  const proxy = getProxyUrlFromEnv();
  if (!proxy) return;
  setGlobalDispatcher(new ProxyAgent(proxy));
};

export const createHttpsProxyAgentFromEnv = () => {
  const proxy = getProxyUrlFromEnv();
  if (!proxy) return undefined;
  return new HttpsProxyAgent(proxy);
};

export const isRegionDeniedError = (err: unknown) => {
  const anyErr = err as any;
  const status = anyErr?.status ?? anyErr?.code ?? anyErr?.response?.status;
  const msg = String(anyErr?.message || anyErr?.error?.message || "");
  return Number(status) === 403 && msg.toLowerCase().includes("not available in your region");
};
