export type PlainTextLogOptions = {
  responseKind?: string;
  responseStatus?: "success" | "abstained" | "error";
  answerMode?: string | null;
  abstained?: boolean;
  abstainReason?: string | null;
  extraMetadata?: Record<string, unknown>;
};

export function buildPlainTextLogInput(
  responseText: string,
  defaultAnswerMode: string | null,
  options?: PlainTextLogOptions,
) {
  return {
    responseText,
    responseKind: options?.responseKind ?? "direct_rule_response",
    responseStatus: options?.responseStatus,
    answerMode: options?.answerMode ?? defaultAnswerMode,
    abstained: options?.abstained,
    abstainReason: options?.abstainReason,
    extraMetadata: options?.extraMetadata,
  };
}
