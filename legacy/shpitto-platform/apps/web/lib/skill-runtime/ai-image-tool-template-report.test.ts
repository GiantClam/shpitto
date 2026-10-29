import { describe, expect, it } from "vitest";
import {
  buildAiImageToolTemplatePerformanceReport,
  buildAiImageToolTemplateSecurityReport,
} from "./ai-image-tool-template-report.ts";

describe("ai-image-tool template reports", () => {
  it("produces a performance report with explicit budgets", () => {
    const report = buildAiImageToolTemplatePerformanceReport();

    expect(report.routeCount).toBeGreaterThanOrEqual(11);
    expect(report.staticHtmlRouteCount).toBeGreaterThanOrEqual(11);
    expect(report.largestStaticHtmlBytes).toBeLessThan(report.budgets.maxStaticHtmlBytes);
    expect(report.externalScriptReferences).toBe(report.budgets.maxExternalScripts);
    expect(report.knownBottlenecks.length).toBeGreaterThan(0);
  });

  it("produces a security report without unresolved blockers", () => {
    const report = buildAiImageToolTemplateSecurityReport();

    expect(report.secretsRemainServerOnly).toBe(true);
    expect(report.webhookSignatureVerification).toBe(true);
    expect(report.paymentEventIdempotency).toBe(true);
    expect(report.unsafeUrlFetchPaths).toEqual([]);
    expect(report.htmlIngestionPaths).toEqual([]);
    expect(report.blockers).toEqual([]);
  });
});
