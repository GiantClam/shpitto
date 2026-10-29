import { describe, expect, it } from "vitest";
import { safeAuthTheme, serializeAuthTheme, withAuthThemePath } from "./theme";

describe("auth theme helpers", () => {
  it("serializes and restores safe auth themes", () => {
    const serialized = serializeAuthTheme({
      brandName: "Acme",
      logo: "/brand/acme-logo.svg",
      mode: "dark",
      typography: "\"Inter\", sans-serif",
      colors: {
        primary: "#1E6F5C",
        accent: "#F59E0B",
        background: "#0F172A",
        surface: "#111827",
        panel: "#1F2937",
        text: "#F8FAFC",
        muted: "#CBD5E1",
        border: "#334155",
      },
    });

    expect(serialized).toContain("Acme");
    expect(safeAuthTheme(serialized)).toEqual(
      expect.objectContaining({
        brandName: "Acme",
        logo: "/brand/acme-logo.svg",
        mode: "dark",
      }),
    );
  });

  it("builds auth links with both next and theme when needed", () => {
    const href = withAuthThemePath(
      "/login",
      "/projects/demo/data",
      {
        brandName: "Acme",
        colors: {
          primary: "#1E6F5C",
          accent: "#F59E0B",
          background: "#0F172A",
          surface: "#111827",
          panel: "#1F2937",
          text: "#F8FAFC",
          muted: "#CBD5E1",
          border: "#334155",
        },
      },
    );

    expect(href).toContain("/login?");
    expect(href).toContain("next=%2Fprojects%2Fdemo%2Fdata");
    expect(href).toContain("theme=");
  });
});
