import { describe, expect, it } from "vitest";
import { applyProjectContactSettingsToProjectJson } from "./project-settings";

describe("project settings helpers", () => {
  it("merges contact settings into project json", () => {
    const projectJson = applyProjectContactSettingsToProjectJson(
      {
        branding: { name: "CASUX" },
      },
      {
        forwardTo: ["official@casux.org.cn", "ops@casux.org.cn"],
        sendUserAck: true,
      },
    ) as any;

    expect(projectJson.settings.contact.forwardTo).toEqual(["official@casux.org.cn", "ops@casux.org.cn"]);
    expect(projectJson.settings.contact.sendUserAck).toBe(true);
    expect(projectJson.branding.name).toBe("CASUX");
  });
});
