import { createHash } from "node:crypto";
import type { ChromeClient } from "./types.js";
import { buildConversationTurnListExpression } from "./conversationTurns.js";

export function browserPromptFingerprint(value: unknown, messageId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([messageId, String(value ?? "").replace(/\r\n?/g, "\n")]))
    .digest("hex");
}

export function resolveSubmittedPromptBaseline(
  initial: number | null,
  recovered: unknown,
): number | null {
  if (initial !== null) return initial;
  // The provider points at the last committed turn, which may already be the assistant.
  return typeof recovered === "number" && Number.isFinite(recovered)
    ? Math.max(0, Math.floor(recovered) - 1)
    : null;
}

export async function readSubmittedPromptFingerprint(
  runtime: ChromeClient["Runtime"],
  baselineTurns: number | null,
  timeoutMs = 0,
): Promise<string | undefined> {
  if (baselineTurns === null) return undefined;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    try {
      const result = await runtime.evaluate({
        expression: `(() => {
        const turns = ${buildConversationTurnListExpression()};
        for (let index = turns.length - 1; index >= ${baselineTurns}; index--) {
          const turn = turns[index];
          const user = turn.matches('[data-message-author-role="user"]') ? turn : turn.querySelector('[data-message-author-role="user"]');
          if (user) return { text: user.textContent, messageId: user.getAttribute('data-message-id') };
        }
        return null;
      })()`,
        returnByValue: true,
      });
      const turn = result.result?.value;
      if (
        typeof turn?.text === "string" &&
        turn.text.trim() &&
        typeof turn.messageId === "string" &&
        turn.messageId.trim()
      )
        return browserPromptFingerprint(turn.text, turn.messageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/Cannot find (?:default )?(?:execution )?context|Execution context (?:was destroyed|is not available)/i.test(
          message,
        )
      )
        return undefined;
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  }
}
