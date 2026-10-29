export type ContractOwnerLayer =
  | "requirement/spec"
  | "skill"
  | "orchestrator/policy"
  | "runtime"
  | "artifact";

export function normalizeContractOwnerLayer(value: unknown): ContractOwnerLayer {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "requirement/spec") return "requirement/spec";
  if (normalized === "skill") return "skill";
  if (normalized === "runtime") return "runtime";
  if (normalized === "artifact") return "artifact";
  return "orchestrator/policy";
}

export function inferOwnerLayerFromViolationCode(code: string): ContractOwnerLayer {
  const normalized = String(code || "").trim().toLowerCase();
  if (/missing_required_file|missing_route_html|invalid_project_artifact|missing_shared_asset/.test(normalized)) {
    return "runtime";
  }
  if (/placeholder|thin_content/.test(normalized)) return "artifact";
  if (
    /homepage_semantic_mismatch|homepage_topology_mismatch|route_identity_mismatch|route_contract_mismatch|product_route_drift|surface_mode_mismatch|shared_shell_drift|locale_shell_mismatch/.test(
      normalized,
    )
  ) {
    return "orchestrator/policy";
  }
  return "orchestrator/policy";
}
