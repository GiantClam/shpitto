"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { WebsitePreview } from "@/components/website-preview";
import { useEffect, useMemo, useState } from "react";
import { Rocket, Hammer, Globe, ExternalLink, Send, Sparkles } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

type BuilderAction = {
  text: string;
  payload?: string;
  type?: "button" | "url";
};

type BuilderDataParts = {
  actions: BuilderAction[];
  preview: any;
};

type BuilderMessage = UIMessage<unknown, BuilderDataParts>;

function extractMessageText(message: BuilderMessage): string {
  return (message.parts || [])
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("")
    .trim();
}

function extractMessageActions(message: BuilderMessage): BuilderAction[] {
  const actions: BuilderAction[] = [];
  for (const part of message.parts || []) {
    if (part.type === "data-actions" && Array.isArray(part.data)) {
      actions.push(...part.data);
    }
  }
  return actions;
}

function extractLatestPreview(messages: BuilderMessage[]): any | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    for (const part of msg.parts || []) {
      if (part.type === "data-preview" && part.data) {
        return part.data;
      }
    }
  }
  return null;
}

function MainContent({ session }: { session: any }) {
  const [projectJson, setProjectJson] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport<BuilderMessage>({
        api: "/api/chat",
        body: {
          user_id: session?.user?.id,
          access_token: session?.access_token,
        },
      }),
    [session?.user?.id, session?.access_token],
  );

  const chatId = useMemo(
    () => (session?.user?.id ? `builder-${session.user.id}` : "builder-anon"),
    [session?.user?.id],
  );

  const { messages, sendMessage, status, error } = useChat<BuilderMessage>({
    id: chatId,
    transport,
  });

  useEffect(() => {
    const latestPreview = extractLatestPreview(messages);
    if (latestPreview) {
      setProjectJson(latestPreview);
    }
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  const currentPage = projectJson?.pages?.find((p: any) => p.path === currentPath) || projectJson?.pages?.[0];
  const puckData = currentPage?.puckData || { content: [] };

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role === "assistant" || m.role === "user"),
    [messages],
  );

  const submitText = async (text: string) => {
    const value = text.trim();
    if (!value || isBusy) return;
    await sendMessage({ text: value });
  };

  const handleActionClick = async (action: BuilderAction) => {
    if (action.type === "url" && action.payload) {
      window.open(action.payload, "_blank");
      return;
    }

    const payload = action.payload || action.text;
    if (!payload) return;
    await submitText(payload);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <div className="z-10 w-full items-center justify-between font-mono text-sm flex h-screen">
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-slate-50">
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
                      {session.user.user_metadata?.full_name || "User"}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">{session.user.email}</div>
                  </div>
                  {session.user.user_metadata?.avatar_url ? (
                    <img
                      src={session.user.user_metadata.avatar_url}
                      alt="Profile"
                      className="w-9 h-9 rounded-full border-2 border-white shadow-sm"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">
                      {(session.user.email?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {projectJson ? (
              <WebsitePreview data={puckData} project_json={projectJson} onNavigate={(path) => setCurrentPath(path)} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center max-w-md px-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Globe className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold mb-3 text-slate-800">Welcome to Shpitto</h2>
                  <p className="text-slate-500 leading-relaxed">
                    Start a conversation with our AI assistant to build your industrial website blueprint. Once you are happy with the plan, click <strong>Build It</strong> to generate the preview.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="w-[420px] h-full border-l bg-white flex flex-col">
          <div className="h-14 border-b px-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Shpitto AI Assistant
            </div>
            <div className="text-xs text-slate-500">
              {isBusy ? "Generating..." : "Ready"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
            {visibleMessages.length === 0 && (
              <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600 leading-relaxed shadow-sm">
                Hi, I am here to help you build an industrial website. Tell me your business type, target customers, and your key services.
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="px-3 py-1.5 rounded-lg border bg-slate-50 hover:bg-slate-100 text-xs font-medium"
                    onClick={() => submitText("We are a CNC machining factory serving aerospace clients.")}
                  >
                    CNC Factory
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg border bg-slate-50 hover:bg-slate-100 text-xs font-medium"
                    onClick={() => submitText("Build a modern homepage with products, certifications, and contact form.")}
                  >
                    Build Homepage
                  </button>
                </div>
              </div>
            )}

            {visibleMessages.map((message) => {
              const text = extractMessageText(message);
              const actions = extractMessageActions(message);
              const isAssistant = message.role === "assistant";

              if (!text && actions.length === 0) return null;

              return (
                <div key={message.id} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-sm border ${
                      isAssistant
                        ? "bg-white border-slate-200 text-slate-700"
                        : "bg-blue-600 border-blue-600 text-white"
                    }`}
                  >
                    {text && <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>}

                    {actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.map((action, index) => (
                          <button
                            key={`${message.id}-${index}-${action.text}`}
                            disabled={isBusy}
                            onClick={() => handleActionClick(action)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {action.text === "Build It" && <Hammer className="w-3.5 h-3.5" />}
                            {action.text.toLowerCase().includes("deploy") && <Rocket className="w-3.5 h-3.5" />}
                            {action.type === "url" && <ExternalLink className="w-3.5 h-3.5" />}
                            {action.text}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isBusy && (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl px-4 py-3 border bg-white text-slate-600 text-sm shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    Working on your request...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error.message}
              </div>
            )}
          </div>

          <form
            className="border-t bg-white p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await submitText(input);
              setInput("");
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe your business and website goals..."
                className="flex-1 min-h-[76px] max-h-40 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                disabled={isBusy}
              />
              <button
                type="submit"
                disabled={isBusy || !input.trim()}
                className="h-10 px-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  return <MainContent session={session} />;
}
