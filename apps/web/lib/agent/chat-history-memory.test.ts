import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createChatTask, completeChatTask, getLatestChatTaskForChat } from "./chat-task-store";
import {
  readChatLongTermPreferences,
  readChatShortTermMemory,
  resetChatLangGraphMemoryForTests,
} from "./chat-memory";

function buildRequirementFormMessage(
  text: string,
  form: Record<string, unknown>,
): string {
  return `${text}\n\n[Requirement Form]\n\`\`\`json\n${JSON.stringify(form, null, 2)}\n\`\`\``;
}

describe("chat history memory", () => {
  it("carries checkpoint/task pointers into refine task workflow context", async () => {
    await resetChatLangGraphMemoryForTests();
    const chatId = `chat-memory-${Date.now()}`;
    const projectPath = path.resolve(process.cwd(), ".tmp", "chat-tests", `${chatId}-project.json`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(
      projectPath,
      JSON.stringify({
        projectId: "memory-demo",
        staticSite: {
          mode: "skill-direct",
          files: [{ path: "/index.html", type: "text/html", content: "<!doctype html><html><body>ok</body></html>" }],
        },
        pages: [{ path: "/", html: "<!doctype html><html><body>ok</body></html>" }],
      }),
      "utf8",
    );

    const generated = await createChatTask(chatId, undefined, {
      assistantText: "generated",
      phase: "end",
      internal: {
        sessionState: {
          messages: [],
          phase: "end",
          current_page_index: 0,
          attempt_count: 0,
          workflow_context: {
            checkpointProjectPath: projectPath,
            deploySourceProjectPath: projectPath,
          },
        },
      },
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });
    await completeChatTask(generated.id, {
      assistantText: "generated",
      phase: "end",
      internal: generated.result?.internal,
      progress: {
        stage: "done",
        checkpointProjectPath: projectPath,
      } as any,
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "把主色改成蓝色" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const latest = await getLatestChatTaskForChat(chatId);
    const workflow = (latest?.result?.internal?.inputState as any)?.workflow_context || {};
    expect(String(workflow.checkpointProjectPath || "")).toBe(projectPath);
    expect(String(workflow.refineSourceProjectPath || "")).toBe(projectPath);
    expect(String(workflow.refineSourceTaskId || "")).toBe(generated.id);

    const shortTerm = await readChatShortTermMemory(chatId);
    expect(String(shortTerm?.revisionPointer?.checkpointProjectPath || "")).toBe(projectPath);
    expect(String(shortTerm?.revisionPointer?.taskId || "")).toBe(latest?.id || "");
    expect(String(shortTerm?.stage || "")).toBe("previewing");
  });

  it("reuses explicit long-term preferences and persists short-term requirement state", async () => {
    await resetChatLangGraphMemoryForTests();
    const ownerUserId = `owner-${Date.now()}`;
    const firstChatId = `chat-pref-a-${Date.now()}`;
    const secondChatId = `chat-pref-b-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");

    const firstReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: firstChatId,
        user_id: ownerUserId,
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: buildRequirementFormMessage("Build a website for an industrial automation supplier.", {
                  siteType: "company",
                  targetAudience: ["procurement teams"],
                  primaryVisualDirection: "industrial-b2b",
                  secondaryVisualTags: ["trustworthy", "blue"],
                  pageStructure: { mode: "single" },
                  functionalRequirements: ["none"],
                  primaryGoal: ["lead generation"],
                  language: "en",
                  brandLogo: { mode: "text_mark" },
                  contentSources: ["new_site"],
                }),
              },
            ],
          },
        ],
      }),
    });

    const firstRes = await POST(firstReq);
    expect(firstRes.status).toBe(200);

    const longTerm = await readChatLongTermPreferences(ownerUserId);
    expect(longTerm?.preferredLocale).toBe("en");
    expect(longTerm?.primaryVisualDirection).toBe("industrial-b2b");
    expect(longTerm?.secondaryVisualTags || []).toEqual(expect.arrayContaining(["trustworthy", "blue"]));

    const firstShortTerm = await readChatShortTermMemory(firstChatId);
    expect(firstShortTerm?.requirementState?.currentValues?.primaryVisualDirection).toBe("industrial-b2b");
    expect(firstShortTerm?.requirementState?.currentValues?.locale).toBe("en");

    const secondReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: secondChatId,
        user_id: ownerUserId,
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: buildRequirementFormMessage("Build a website for a robotics parts manufacturer.", {
                  siteType: "company",
                  targetAudience: ["factory engineers"],
                  pageStructure: { mode: "single" },
                  functionalRequirements: ["none"],
                  primaryGoal: ["lead generation"],
                  brandLogo: { mode: "text_mark" },
                  contentSources: ["new_site"],
                }),
              },
            ],
          },
        ],
      }),
    });

    const secondRes = await POST(secondReq);
    expect(secondRes.status).toBe(200);

    const secondShortTerm = await readChatShortTermMemory(secondChatId);
    expect(secondShortTerm?.requirementState?.currentValues?.locale).toBe("en");
    expect(secondShortTerm?.requirementState?.currentValues?.primaryVisualDirection).toBe("industrial-b2b");
    expect(secondShortTerm?.requirementState?.currentValues?.secondaryVisualTags || []).toEqual(
      expect.arrayContaining(["trustworthy", "blue"]),
    );
  });
});
