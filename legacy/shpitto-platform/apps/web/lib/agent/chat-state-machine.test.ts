import { describe, expect, it } from "vitest";
import { deriveConversationStage } from "./chat-orchestrator";

describe("chat state machine", () => {
  it("returns drafting when no baseline exists", () => {
    const stage = deriveConversationStage({});
    expect(stage).toBe("drafting");
  });

  it("returns previewing when checkpoint exists", () => {
    const stage = deriveConversationStage({
      checkpointProjectPath: "/tmp/chat/project.json",
    });
    expect(stage).toBe("previewing");
  });

  it("returns deployed when deployed url exists", () => {
    const stage = deriveConversationStage({
      latestDeployedUrl: "https://demo.pages.dev",
      checkpointProjectPath: "/tmp/chat/project.json",
    });
    expect(stage).toBe("deployed");
  });

  it("returns deploying when deploy task is running", () => {
    const stage = deriveConversationStage({
      latestTaskStatus: "running",
      latestProgressStage: "deploying:upload",
      checkpointProjectPath: "/tmp/chat/project.json",
    });
    expect(stage).toBe("deploying");
  });
});

