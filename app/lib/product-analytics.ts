"use client";

import posthog from "posthog-js";
import type { ProductEventName, ProductEventProperties } from "@/lib/analytics/product-events";

function analyticsIsConfigured() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return false;
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return false;
  return window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
}

export function captureProductEvent<Name extends ProductEventName>(
  name: Name,
  properties: ProductEventProperties[Name],
) {
  if (!analyticsIsConfigured()) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // Analytics must never interrupt the product interaction it describes.
  }
}
