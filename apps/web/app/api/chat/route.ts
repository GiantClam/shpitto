import { 
  CopilotRuntime, 
  ExperimentalEmptyAdapter, 
  copilotRuntimeNextJSAppRouterEndpoint, 
} from "@copilotkit/runtime"; 
import { LangGraphAgent } from "@copilotkit/runtime/langgraph"; 
import { NextRequest } from "next/server"; 

// 1. 使用 Empty Adapter，因为具体的逻辑由外部 LangGraph 处理
const serviceAdapter = new ExperimentalEmptyAdapter(); 

// 2. 配置远程 LangGraph 代理
const runtime = new CopilotRuntime({ 
  agents: {
    default: new LangGraphAgent({ 
      description: "Shipitto project blueprinting agent.",
      // 连接到本地启动的 langgraph dev 端口
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8123", 
      graphId: "default", 
    }) 
  }
}); 

export const POST = async (req: NextRequest) => { 
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({ 
    runtime, 
    serviceAdapter,
    endpoint: "/api/chat", 
  }); 

  return handleRequest(req); 
};
