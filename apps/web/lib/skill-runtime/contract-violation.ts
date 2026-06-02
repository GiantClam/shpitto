import type { ContractOwnerLayer } from "./owner-layer.ts";
import { inferOwnerLayerFromViolationCode } from "./owner-layer.ts";

export type ContractViolationCode =
  | "missing_required_file"
  | "missing_shared_asset"
  | "missing_route_html"
  | "invalid_project_artifact"
  | "placeholder_copy"
  | "thin_content"
  | "homepage_semantic_mismatch"
  | "homepage_topology_mismatch"
  | "route_identity_mismatch"
  | "route_contract_mismatch"
  | "surface_mode_mismatch"
  | "shared_shell_drift"
  | "locale_shell_mismatch";

export type RouteUnitVerificationRecord = {
  route: string;
  htmlPath: string;
  status: "passed" | "artifact_failure" | "contract_violation";
  checkedFiles: string[];
  issues: string[];
  violationCode?: ContractViolationCode;
  ownerLayer?: ContractOwnerLayer;
  violatedFields?: string[];
  evidence?: string[];
};

export type ContractVerificationResult =
  | {
      status: "passed";
      checkedRoutes: string[];
      routeResults: RouteUnitVerificationRecord[];
    }
  | {
      status: "artifact_failure";
      scope: "route" | "shared";
      route?: string;
      issues: string[];
      routeResults: RouteUnitVerificationRecord[];
      violationCode: ContractViolationCode;
      ownerLayer: ContractOwnerLayer;
      violatedFields: string[];
      evidence: string[];
    }
  | {
      status: "contract_violation";
      scope: "route" | "shared";
      ownerLayer: ContractOwnerLayer;
      route?: string;
      issues: string[];
      routeResults: RouteUnitVerificationRecord[];
      violationCode: ContractViolationCode;
      violatedFields: string[];
      evidence: string[];
    };

export function buildContractViolationRecord(params: {
  route: string;
  htmlPath: string;
  status: "artifact_failure" | "contract_violation";
  checkedFiles: string[];
  issues: string[];
  violationCode: ContractViolationCode;
  ownerLayer?: ContractOwnerLayer;
  violatedFields?: string[];
  evidence?: string[];
}): RouteUnitVerificationRecord {
  return {
    route: params.route,
    htmlPath: params.htmlPath,
    status: params.status,
    checkedFiles: params.checkedFiles,
    issues: params.issues,
    violationCode: params.violationCode,
    ownerLayer: params.ownerLayer || inferOwnerLayerFromViolationCode(params.violationCode),
    violatedFields: params.violatedFields || [],
    evidence: params.evidence || [],
  };
}

export class GenerationContractViolationError extends Error {
  readonly verification: Extract<ContractVerificationResult, { status: "contract_violation" | "artifact_failure" }>;

  constructor(verification: Extract<ContractVerificationResult, { status: "contract_violation" | "artifact_failure" }>) {
    super(
      verification.status === "contract_violation"
        ? `Generation contract violation (${verification.violationCode})`
        : `Generation artifact failure (${verification.violationCode})`,
    );
    this.name = "GenerationContractViolationError";
    this.verification = verification;
  }
}
