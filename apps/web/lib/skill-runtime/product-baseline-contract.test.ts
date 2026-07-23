import { describe, expect, it } from "vitest";
import {
  normalizeProductBaselineSelection,
  selectAiImageToolBaselineSelection,
} from "./product-baseline-contract";

describe("ai-image-tool baseline contract", () => {
  it("exposes i18n, payload admin, and billing runtime metadata", () => {
    const selection = selectAiImageToolBaselineSelection();
    const immutable = selection.contract.immutable;

    expect(immutable.i18nContract.routeStrategy).toBe("shared-structure-with-locale-catalogs");
    expect(immutable.i18nContract.localeCatalogPaths).toContain("messages/en/product.json");
    expect(immutable.i18nContract.supportedLocales).toEqual(["en"]);
    expect(immutable.payloadAdminContract).toMatchObject({
      mode: "optional",
    });
    expect(immutable.templateBlueprint?.sharedShell.marketingNav.map((item) => item.href)).not.toContain("/admin");
    expect(immutable.templateBlueprint?.sharedShell.marketingNav.map((item) => item.href)).not.toContain("/sign-in");
    expect(immutable.templateBlueprint?.sharedShell.appNav.map((item) => item.href)).not.toContain("/admin");
    expect(immutable.payloadAdminContract?.collections).toContain("PaymentProviders");
    expect(immutable.billingRuntimeContract).toMatchObject({
      sourceModel: "fluxkreafree",
      defaultProvider: "stripe",
    });
    expect(immutable.billingRuntimeContract?.providers.map((item) => item.id)).toContain("stripe");
    expect(immutable.billingRuntimeContract?.preservedEntities).toContain("UserCredit");
    expect(immutable.billingRuntimeContract?.catalog.map((item) => item.id)).toContain("starter-100");
    expect(selection.routeOwnership["/app/generate"]).toBe("product");
    expect(selection.routeOwnership["/pricing"]).toBe("brand");
  });

  it("normalizes malformed persisted metadata without dropping the baseline", () => {
    const selection = normalizeProductBaselineSelection({
      baselineId: "custom-baseline",
      contract: {
        immutable: {
          i18nContract: {
            routeStrategy: "broken",
            localeCatalogPaths: ["messages/fr/product.json"],
          },
          payloadAdminContract: {
            mode: "broken",
            globals: ["SiteSettings"],
          },
          billingRuntimeContract: {
            defaultProvider: "broken",
            supportedBillingModes: ["credits", "oops"],
            providers: [{ id: "broken" }, { id: "paypal", label: "PayPal" }],
            catalog: [
              {
                id: "bad-item",
                kind: "bad-kind",
                billingMode: "bad-mode",
              },
            ],
          },
        },
      },
    });

    expect(selection).toBeDefined();
    expect(selection?.contract.immutable.i18nContract.routeStrategy).toBe("shared-structure-with-locale-catalogs");
    expect(selection?.contract.immutable.i18nContract.localeCatalogPaths).toEqual(["messages/fr/product.json"]);
    expect(selection?.contract.immutable.payloadAdminContract).toMatchObject({
      mode: "optional",
      globals: ["SiteSettings"],
    });
    expect(selection?.contract.immutable.billingRuntimeContract).toMatchObject({
      defaultProvider: "stripe",
      supportedBillingModes: ["credits"],
    });
    expect(selection?.contract.immutable.billingRuntimeContract?.providers).toEqual([
      {
        id: "paypal",
        label: "PayPal",
        role: "default",
        enabledByDefault: true,
        capabilities: [],
        secretEnv: [],
        publicEnv: [],
        notes: [],
      },
    ]);
    expect(selection?.contract.immutable.billingRuntimeContract?.catalog).toEqual([]);
  });
});
