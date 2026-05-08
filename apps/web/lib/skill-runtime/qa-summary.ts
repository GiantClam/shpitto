export type QaIssueSummary = {
  code: string;
  severity: "error" | "warning";
  count: number;
};

export type QaSummary = {
  averageScore: number;
  totalRoutes: number;
  passedRoutes: number;
  totalRetries: number;
  retriesAllowed: number;
  antiSlopIssueCount: number;
  categories: QaIssueSummary[];
};
