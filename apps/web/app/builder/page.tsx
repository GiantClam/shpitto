"use client";

import { CopilotKit, useCopilotAction, useCopilotChat, useRenderToolCall } from "@copilotkit/react-core";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { WebsitePreview } from "@/components/website-preview";
import { useState, useEffect } from "react";
import { Rocket, Hammer, Globe, ExternalLink } from "lucide-react";
import { createBrowserClient } from '@supabase/ssr';

function MainContent({ session }: { session: any }) {
  const [projectJson, setProjectJson] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [isDeploying, setIsDeploying] = useState(false);
  const { appendMessage } = useCopilotChat();

  useRenderToolCall({
    name: "presentActions",
    description: "Present actionable buttons to the user.",
    render: (props) => {
      const { actions } = props.args as any;
      console.log("🛠️ [useRenderToolCall:presentActions] Received actions:", actions);
      
      if (!actions || actions.length === 0) return <></>;

      return (
        <div className="flex flex-wrap gap-2 mt-2 mb-4 px-4">
          {actions.map((action: any, i: number) => (
            <button
              key={i}
              disabled={isDeploying && action.text.includes("Deploy")}
              onClick={() => {
                console.log(`🖱️ [Action Clicked] ${action.text}`, action);
                if (action.type === "url") {
                  window.open(action.payload, "_blank");
                } else {
                  appendMessage(new TextMessage({ 
                    content: action.payload || action.text, 
                    role: Role.User 
                  }));
                }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 ${
                isDeploying && action.text.includes("Deploy")
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
              }`}
            >
              {action.text === "Build It" && <Hammer className="w-4 h-4" />}
              {action.text.includes("Deploy") && (
                isDeploying ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )
              )}
              {action.type === "url" && <ExternalLink className="w-4 h-4" />}
              {action.text}
            </button>
          ))}
        </div>
      );
    }
  });

  useRenderToolCall({
    name: "showWebsitePreview",
    description: "Show the generated website preview to the user.",
    render: (props) => {
      const { projectJson: actionProjectJson } = props.args as any;
      console.log("🖥️ [useRenderToolCall:showWebsitePreview] Received projectJson:", actionProjectJson ? "Data present" : "Empty");
      
      // Update state if not already set or different
      if (actionProjectJson && (!projectJson || JSON.stringify(actionProjectJson) !== JSON.stringify(projectJson))) {
        console.log("🔄 [State Update] Setting projectJson from ToolCall");
        // Use a timeout to avoid state updates during render
        setTimeout(() => setProjectJson(actionProjectJson), 0);
      }
      
      return (
        <div className="mx-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-blue-900">Website Preview Ready</div>
            <div className="text-sm text-blue-700">Explore the generated layout and SEO optimized content.</div>
          </div>
        </div>
      );
    }
  });

  useCopilotAction({
    name: "startDeployment",
    description: "Start the deployment process.",
    handler: () => {
      setIsDeploying(true);
    }
  });

  useCopilotAction({
    name: "notifyDeploymentStatus",
    description: "Notify the user about the deployment status.",
    parameters: [
      { name: "status", type: "string" },
      { name: "url", type: "string" },
      { name: "message", type: "string" }
    ],
    handler: ({ status }) => {
      if (status === "success" || status === "error") {
        setIsDeploying(false);
      }
    }
  });

  const currentPage = projectJson?.pages?.find((p: any) => p.path === currentPath) || projectJson?.pages?.[0];
  const puckData = currentPage?.puckData || { content: [] };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <div className="z-10 w-full items-center justify-between font-mono text-sm flex h-screen">
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-slate-50">
          {/* Header Bar */}
          <div className="h-14 border-b bg-white flex items-center justify-between px-6 shadow-sm z-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
              <span className="font-bold text-slate-800 tracking-tight text-lg">Shpitto Preview</span>
              {projectJson && (
                <div className="ml-4 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wider">
                  Draft Generated
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {session?.user && (
                <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-slate-800 leading-tight">
                      {session.user.user_metadata?.full_name || 'User'}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      {session.user.email}
                    </div>
                  </div>
                  {session.user.user_metadata?.avatar_url ? (
                    <img 
                      src={session.user.user_metadata.avatar_url} 
                      alt="Profile" 
                      className="w-9 h-9 rounded-full border-2 border-white shadow-sm" 
                    />
                  ) : (
                    <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">
                      {(session.user.email?.[0] || 'U').toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {projectJson ? (
              <WebsitePreview 
                data={puckData} 
                project_json={projectJson}
                onNavigate={(path) => setCurrentPath(path)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center max-w-md px-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Globe className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold mb-3 text-slate-800">Welcome to Shpitto</h2>
                  <p className="text-slate-500 leading-relaxed">
                    Start a conversation with our AI assistant to build your industrial website blueprint. Once you&apos;re happy with the plan, click <strong>&quot;Build It&quot;</strong> to generate the preview.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <CopilotSidebar
          instructions="Help the user build an industrial website by generating a project blueprint."
          defaultOpen={true}
          labels={{
            title: "Shpitto AI Assistant",
            initial: "Hi! I'm here to help you build your industrial website. What kind of business are you in?",
          }}
          AssistantMessage={(props: any) => {
            const { message } = props;
            
            // Extract tool calls from various possible locations
            const toolCalls = (message as any).toolCalls || 
                             (message as any).tool_calls || 
                             (message as any).additional_kwargs?.tool_calls || [];
            
            // Log message details for debugging
            console.log(`📩 [AssistantMessage:${message.id}] Received message:`, {
              content: typeof message.content === 'string' ? message.content.substring(0, 50) + "..." : "Non-string content",
              toolCallsCount: toolCalls.length,
              toolNames: toolCalls.map((tc: any) => tc.function?.name || tc.name),
            });

            // Find specific tool calls
            const actionsToolCall = toolCalls.find((tc: any) => 
              (tc.function?.name === "presentActions" || tc.name === "presentActions")
            );

            // Parse actions from tool call
            let actions = (message as any).additional_kwargs?.actions || (message as any).actions;
            
            if (actionsToolCall) {
              console.log(`🛠️ [AssistantMessage] Found presentActions tool call:`, actionsToolCall);
              
              const rawArgs = actionsToolCall.args || actionsToolCall.function?.arguments;
              if (rawArgs) {
                try {
                  const parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
                  if (parsedArgs.actions) {
                    actions = parsedArgs.actions;
                  }
                } catch (e) {
                  console.error("❌ [AssistantMessage] Failed to parse tool call args:", e);
                }
              }
            }
            
            if (actions) {
              console.log(`🔘 [AssistantMessage] Final actions to render:`, actions);
            }

            const previewToolCall = toolCalls.find((tc: any) => 
              (tc.function?.name === "showWebsitePreview" || tc.name === "showWebsitePreview")
            );
            
            let previewData = (message as any).additional_kwargs?.projectJson || 
                               (message as any).additional_kwargs?.project_json ||
                               (message as any).projectJson ||
                               (message as any).project_json;
            
            if (previewToolCall) {
              const rawArgs = previewToolCall.args || previewToolCall.function?.arguments;
              if (rawArgs) {
                try {
                  const parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
                  if (parsedArgs.projectJson || parsedArgs.project_json) {
                    previewData = parsedArgs.projectJson || parsedArgs.project_json;
                  }
                } catch (e) {
                  console.error("❌ [AssistantMessage] Failed to parse preview tool call args:", e);
                }
              }
            }

            // Sync with global projectJson state if previewData is found
            if (previewData && (!projectJson || JSON.stringify(previewData) !== JSON.stringify(projectJson))) {
              console.log("🔄 [AssistantMessage] Syncing previewData to global state");
              setTimeout(() => setProjectJson(previewData), 0);
            }

            if (previewData) {
              console.log(`🌐 [AssistantMessage] Found preview data to render`);
            }

            // Ensure message content is a string before checking/rendering
            const messageContent = typeof message.content === 'string' 
              ? message.content 
              : Array.isArray(message.content) 
                ? (message.content as any[]).map(c => c.text || '').join('') // Handle structured content if any
                : '';

            // If message content is empty/null AND no actions/preview to show, don't render anything
            if (!messageContent && !actions && !previewData) {
              return null;
            }

            return (
              <div className="flex flex-col gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm mb-4 mx-2">
                {messageContent && (
                  <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {messageContent}
                  </div>
                )}

                {previewData && (
                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 mt-1">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-green-800 text-sm">Preview Generated</div>
                      <div className="text-xs text-green-600">The website blueprint is ready for review.</div>
                    </div>
                  </div>
                )}
                
                {actions && Array.isArray(actions) && actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-50 mt-1">
                    {actions.map((action: any, i: number) => (
                      <button
                        key={i}
                        disabled={isDeploying && action.text.includes("Deploy")}
                        onClick={() => {
                          if (action.type === "url") {
                            window.open(action.payload, "_blank");
                          } else {
                            appendMessage(new TextMessage({ 
                              content: action.payload || action.text, 
                              role: Role.User 
                            }));
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 ${
                          isDeploying && action.text.includes("Deploy")
                            ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                        }`}
                      >
                        {action.text === "Build It" && <Hammer className="w-4 h-4" />}
                        {action.text.includes("Deploy") && (
                          isDeploying ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Rocket className="w-4 h-4" />
                          )
                        )}
                        {action.type === "url" && <ExternalLink className="w-4 h-4" />}
                        {action.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        />
      </div>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  return (
    <CopilotKit 
      runtimeUrl="/api/chat" 
      properties={{ 
        user_id: session?.user?.id, 
        access_token: session?.access_token 
      }}
    >
      <MainContent session={session} />
    </CopilotKit>
  );
}
