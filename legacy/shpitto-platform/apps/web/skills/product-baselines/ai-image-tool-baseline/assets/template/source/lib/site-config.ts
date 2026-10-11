import { site } from "../content/site";

export const siteConfig = {
  ...site,
  executionScope: 'full-baseline',
  templateFamily: 'ai-image-tool-platform',
} as const;
