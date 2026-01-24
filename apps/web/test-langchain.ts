
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";

dotenv.config();

const run = async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelName = process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";

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
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://shpitto.com",
        "X-Title": "Shpitto",
      },
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
