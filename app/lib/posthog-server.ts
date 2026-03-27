import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;
const noopClient = {
  capture() {},
  shutdownAsync: async () => {},
};

export function getPostHogClient() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host || process.env.NODE_ENV !== "production") {
    return noopClient;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
