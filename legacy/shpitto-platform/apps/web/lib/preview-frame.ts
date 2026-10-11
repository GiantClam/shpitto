export type PreviewFrameDevice = {
  frame?: string;
};

const BLOCKED_PROTOCOL_PATTERN = /^(?:javascript|data|vbscript|file):/i;

export function sanitizePreviewFrameScreenTarget(rawTarget: string, origin: string): string {
  const value = String(rawTarget || "").trim();
  const baseOrigin = String(origin || "").trim();
  if (!value || !baseOrigin || BLOCKED_PROTOCOL_PATTERN.test(value)) return "";

  try {
    const baseUrl = new URL(baseOrigin);
    const resolved = new URL(value, baseUrl);
    if (!/^https?:$/.test(resolved.protocol)) return "";
    if (resolved.origin !== baseUrl.origin) return "";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "";
  }
}

export function buildPreviewDeviceUrl(
  previewUrl: string,
  device: PreviewFrameDevice | undefined,
  urlLabel: string,
  origin: string,
): string {
  const normalizedPreviewUrl = String(previewUrl || "").trim();
  if (!normalizedPreviewUrl) return "";
  if (!device?.frame) return normalizedPreviewUrl;

  const safeScreen = sanitizePreviewFrameScreenTarget(normalizedPreviewUrl, origin);
  if (!safeScreen) return normalizedPreviewUrl;

  const params = new URLSearchParams({ screen: safeScreen });
  if (device.frame === "browser-chrome.html") {
    params.set("url", urlLabel || "Generated preview");
  }
  return `/frames/${device.frame}?${params.toString()}`;
}
