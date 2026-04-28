import { describe, expect, it } from "vitest";

describe("chat task worker route", () => {
  it("is disabled because the chat worker runs on Railway", async () => {
    const { GET, POST } = await import("../../app/api/chat/tasks/worker/route");

    const getRes = await GET(new Request("http://localhost/api/chat/tasks/worker?limit=1"));
    const getJson = await getRes.json();
    expect(getRes.status).toBe(410);
    expect(getJson.error).toContain("Railway persistent worker");

    const postRes = await POST(new Request("http://localhost/api/chat/tasks/worker", { method: "POST" }));
    expect(postRes.status).toBe(410);
  });
});
