import { describe, expect, it } from "vitest";
import { storeLaunchCenterChatHandoff, takeLaunchCenterChatHandoff } from "./chat-handoff";

describe("launch center chat handoff", () => {
  it("keeps prompt and files available for the next chat page read", async () => {
    const file = new File(["hello"], "brief.txt", { type: "text/plain" });

    await storeLaunchCenterChatHandoff("project-1", {
      prompt: "Build a website from this brief",
      files: [file],
    });

    const handoff = await takeLaunchCenterChatHandoff("project-1");

    expect(handoff?.prompt).toBe("Build a website from this brief");
    expect(handoff?.files).toHaveLength(1);
    expect(handoff?.files[0]?.name).toBe("brief.txt");
    await expect(takeLaunchCenterChatHandoff("project-1")).resolves.toBeUndefined();
  });
});
