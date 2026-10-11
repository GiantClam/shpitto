"use client";

import { Suspense, useEffect } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_GA_MEASUREMENT_ID = "G-F1L3J340VK";

const GA_MEASUREMENT_ID = (
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ||
  DEFAULT_GA_MEASUREMENT_ID
).trim();

function sendGoogleAnalyticsEvent(name: string, params: Record<string, unknown>) {
  window.gtag?.("event", name, params);
}

function GoogleAnalyticsPageView({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!window.gtag || !pathname) return;

    const query = searchParams.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;

    window.gtag("config", measurementId, {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
      send_page_view: true,
    });
  }, [measurementId, pathname, searchParams]);

  return null;
}

function GoogleAnalyticsWebVitals() {
  useReportWebVitals((metric) => {
    const value = metric.name === "CLS" ? Math.round(metric.value * 1000) : Math.round(metric.value);

    sendGoogleAnalyticsEvent(metric.name, {
      event_category: "Web Vitals",
      event_label: metric.id,
      value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
      metric_navigation_type: metric.navigationType,
      non_interaction: true,
    });
  });

  return null;
}

function GoogleAnalyticsClientIssues() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendGoogleAnalyticsEvent("exception", {
        description: event.message || "Unhandled client error",
        fatal: false,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "Unhandled promise rejection");

      sendGoogleAnalyticsEvent("exception", {
        description: reason,
        fatal: false,
        source: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

function MissingGoogleAnalyticsConfigWarning() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      console.warn("Google Analytics is disabled: NEXT_PUBLIC_GA_MEASUREMENT_ID is not configured.");
    }
  }, []);

  return null;
}

export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return <MissingGoogleAnalyticsConfigWarning />;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
          `,
        }}
      />
      <Suspense fallback={null}>
        <GoogleAnalyticsPageView measurementId={GA_MEASUREMENT_ID} />
      </Suspense>
      <GoogleAnalyticsWebVitals />
      <GoogleAnalyticsClientIssues />
    </>
  );
}
