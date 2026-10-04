"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  PRODUCT_EVENT_NAMES,
  classifyProductView,
  decideReturningVisit,
  productEventKey,
} from "@/lib/analytics/product-events";
import { captureProductEvent } from "@/app/lib/product-analytics";

const VISITED_KEY = "uichicago_analytics_visited_v1";
const SESSION_KEY = "uichicago_analytics_session_v1";

export default function ProductAnalyticsTracker() {
  const pathname = usePathname();
  const lastViewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const decision = decideReturningVisit({
        hasVisited: window.localStorage.getItem(VISITED_KEY) === "1",
        sessionMarked: window.sessionStorage.getItem(SESSION_KEY) === "1",
      });
      if (decision.markVisited) window.localStorage.setItem(VISITED_KEY, "1");
      if (decision.markSession) window.sessionStorage.setItem(SESSION_KEY, "1");
      if (decision.captureReturningUser) {
        captureProductEvent(PRODUCT_EVENT_NAMES.returningUser, { visit_type: "returning" });
      }
    } catch {
      // Storage can be denied or unavailable; rendering and navigation continue.
    }
  }, []);

  useEffect(() => {
    const event = classifyProductView(pathname);
    if (!event) {
      lastViewKeyRef.current = null;
      return;
    }
    const eventKey = productEventKey(event);
    if (eventKey === lastViewKeyRef.current) return;
    lastViewKeyRef.current = eventKey;
    captureProductEvent(event.name, event.properties);
  }, [pathname]);

  return null;
}
