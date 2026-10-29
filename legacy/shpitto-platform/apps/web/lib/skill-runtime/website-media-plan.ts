export type WebsiteMediaResource = {
  resourceId: string;
  route: string;
  slotOwner: string;
  imagePurpose: string;
  placementBand: string;
  preferredRatio: string;
  displayMode?: string;
  sourcePriority?: string;
  mediaSourceRule?: string;
  sourceValidationRule?: string;
  desktopImageArea?: string;
  mobileImageArea?: string;
  desktopTextCompanionArea?: string;
  heroVisualBalance?: string;
  objectFitRule?: string;
  captionPolicy?: string;
  suggestedAsset?: {
    url: string;
    alt: string;
    caption: string;
  };
};

function contractLine(label: string, value?: string): string[] {
  const normalized = String(value || "").trim();
  return normalized ? [`- ${label}: ${normalized}`] : [];
}

export function mediaPlanLinesFromResource(resource: WebsiteMediaResource): string[] {
  return [
    ...contractLine("slot_owner", resource.slotOwner),
    ...contractLine("image_purpose", resource.imagePurpose),
    ...contractLine("placement_band", resource.placementBand),
    ...contractLine("preferred_ratio", resource.preferredRatio),
    ...contractLine("display_mode", resource.displayMode),
    ...contractLine("source_priority", resource.sourcePriority),
    ...contractLine("media_source_rule", resource.mediaSourceRule),
  ];
}

export function mediaResourceContractLines(resource: WebsiteMediaResource): string[] {
  return [
    ...contractLine("resource_id", resource.resourceId),
    ...contractLine("source_priority", resource.sourcePriority),
    ...contractLine("image_purpose", resource.imagePurpose),
    ...contractLine("placement_band", resource.placementBand),
    ...contractLine("preferred_ratio", resource.preferredRatio),
    ...contractLine("desktop_image_area", resource.desktopImageArea),
    ...contractLine("mobile_image_area", resource.mobileImageArea),
    ...contractLine("desktop_text_companion_area", resource.desktopTextCompanionArea),
    ...contractLine("hero_visual_balance", resource.heroVisualBalance),
    ...contractLine("object_fit_rule", resource.objectFitRule),
    ...contractLine("display_mode", resource.displayMode),
    ...contractLine("source_validation_rule", resource.sourceValidationRule),
    ...(resource.suggestedAsset
      ? [
          `- suggested_asset_url: ${resource.suggestedAsset.url}`,
          `- suggested_asset_alt: ${resource.suggestedAsset.alt}`,
          `- suggested_asset_caption: ${resource.suggestedAsset.caption}`,
        ]
      : []),
    ...contractLine("caption_policy", resource.captionPolicy),
  ];
}

export function mediaResourceMarkdownSection(resource: WebsiteMediaResource): string {
  return [`### resource:${resource.route}`, `- route: ${resource.route}`, ...mediaResourceContractLines(resource)].join("\n");
}
