
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const run = async () => {
  const apiKey = process.env.AIBERM_API_KEY;
  const modelName = process.env.LLM_MODEL_AIBERM || process.env.LLM_MODEL || "claude-sonnet-4-5-20250929";
  const baseURL = process.env.AIBERM_BASE_URL || "https://aiberm.com/v1";

  console.log(`Model: ${modelName}`);
  console.log(`Key: ${apiKey?.substring(0, 10)}...`);

  const proxyUrl =
    process.env.PROXY_URL ||
    process.env.ALL_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  const model = new ChatOpenAI({
    modelName: modelName,
    openAIApiKey: apiKey,
    configuration: {
      baseURL,
      ...(httpAgent ? { httpAgent } : {}),
    },
    temperature: 0,
  });

  try {
    const res = await model.invoke([new SystemMessage("Hello, world!")]);
    console.log("Success:", res.content);
  } catch (e) {
    console.error("Error:", e);
  }
};

run();
