"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  variant?: "full" | "mark";
  className?: string;
  imageClassName?: string;
};

const logoSources = {
  full: "/brand/shpitto-logo-full.png",
  mark: "/brand/shpitto-logo-mark.png",
} as const;

const logoSizes = {
  full: { width: 853, height: 672 },
  mark: { width: 414, height: 366 },
} as const;

export function BrandLogo({ href = "/", variant = "full", className = "", imageClassName = "" }: BrandLogoProps) {
  const source = logoSources[variant];
  const size = logoSizes[variant];
  const wrapperClassName =
    variant === "full"
      ? "rounded-2xl bg-white px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/5"
      : "rounded-xl bg-white px-1.5 py-1.5 shadow-[0_10px_22px_rgba(0,0,0,0.14)] ring-1 ring-black/5";
  const logoClassName = variant === "full" ? "h-14 w-auto md:h-16" : "h-8 w-8 md:h-9 md:w-9";

  return (
    <Link href={href} aria-label="Shpitto home" className={cn("inline-flex items-center justify-center", wrapperClassName, className)}>
      <Image src={source} alt="Shpitto logo" width={size.width} height={size.height} priority className={cn("block object-contain", logoClassName, imageClassName)} />
    </Link>
  );
}
