import type { GenerationContractRouteUnit } from "../agent/website-generation-contract.ts";
import type { ProductRouteOwner } from "./product-baseline-contract.ts";

export type RouteUnitContract = GenerationContractRouteUnit & {
  routeKey: string;
  htmlPath: string;
  owner: ProductRouteOwner;
};

export function normalizeRouteUnitRoute(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`.replace(/\/{2,}/g, "/");
}

export function routeUnitHtmlPath(route: string): string {
  const normalized = normalizeRouteUnitRoute(route);
  return normalized === "/" ? "/index.html" : `${normalized}/index.html`;
}

export function buildRouteUnitRouteKey(route: string): string {
  const normalized = normalizeRouteUnitRoute(route);
  return normalized === "/" ? "route-home" : `route-${normalized.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-")}`;
}

export function normalizeRouteUnitContract(input: GenerationContractRouteUnit): RouteUnitContract {
  const route = normalizeRouteUnitRoute(input.route);
  return {
    ...input,
    route,
    navLabel: String(input.navLabel || "").trim() || (route === "/" ? "Home" : route.replace(/^\/+/, "")),
    pageKind: String(input.pageKind || "intent").trim() || "intent",
    routeContract: Array.isArray(input.routeContract)
      ? input.routeContract.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    inheritedSeedSkillIds: Array.isArray(input.inheritedSeedSkillIds)
      ? input.inheritedSeedSkillIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    owner: input.owner || "brand",
    routeKey: buildRouteUnitRouteKey(route),
    htmlPath: routeUnitHtmlPath(route),
  };
}
