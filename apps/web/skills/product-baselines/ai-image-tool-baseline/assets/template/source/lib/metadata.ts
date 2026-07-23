import type { Metadata } from "next";
import { site } from "../content/site";

export function buildSiteMetadata(title?: string): Metadata {
  return {
    title: title ? `${title} | ${site.name}` : site.name,
    description: `${site.name} ships a launch-ready Shpitto baseline with reusable sections and deployable code.`,
  };
}
