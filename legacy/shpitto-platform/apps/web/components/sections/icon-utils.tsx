"use client";

import * as LucideIcons from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

type IconComponent = ComponentType<LucideProps>;

const toPascalCase = (value: string) => {
  const cleaned = value
    .replace(/icon$/i, "")
    .replace(/[-_\s]+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
};

export const resolveLucideIcon = (name?: string): IconComponent => {
  const raw = (name || "").trim();
  if (!raw) return LucideIcons.Check;

  const candidates = [
    raw,
    raw.replace(/[-_\s]+/g, ""),
    toPascalCase(raw),
    raw.charAt(0).toUpperCase() + raw.slice(1),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const icon = LucideIcons[candidate as keyof typeof LucideIcons];
    if (typeof icon === "function") {
      return icon as IconComponent;
    }
  }

  return LucideIcons.Check;
};
