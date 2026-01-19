
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import dotenv from "dotenv";

dotenv.config();

const run = async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelName = process.env.LLM_MODEL || "google/gemini-2.0-flash-exp:free";

  console.log(`Model: ${modelName}`);
  console.log(`Key: ${apiKey?.substring(0, 10)}...`);

  const model = new ChatOpenAI({
    modelName: modelName,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://shipitto.com",
        "X-Title": "ShipItTo",
      },
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
