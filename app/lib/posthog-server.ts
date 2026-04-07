import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;
type PostHogEvent = Parameters<PostHog["capture"]>[0];
type ServerPostHogClient = Pick<PostHog, "capture" | "captureImmediate" | "flush">;

const noopClient = {
  capture(event: PostHogEvent) {
    void event;
  },
  captureImmediate: async (event: PostHogEvent) => {
    void event;
  },
  flush: async () => {},
} satisfies ServerPostHogClient;

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

export async function capturePostHogEvent(event: PostHogEvent) {
  await getPostHogClient().captureImmediate(event);
}
