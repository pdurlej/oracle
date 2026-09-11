import { createHash } from "node:crypto";
import type { ChromeClient } from "./types.js";
import { buildConversationTurnListExpression } from "./conversationTurns.js";

export function normalizeBrowserPromptText(value: unknown): string {
  return String(value ?? "")
    .replace(/```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function browserPromptFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(String(value ?? "").replace(/\r\n?/g, "\n"))
    .digest("hex");
}

export async function readSubmittedPromptFingerprint(
  runtime: ChromeClient["Runtime"],
  baselineTurns: number | null,
): Promise<string | undefined> {
  if (baselineTurns === null) return undefined;
  try {
    const result = await runtime.evaluate({
      expression: `(() => {
        const turns = ${buildConversationTurnListExpression()};
        for (let index = turns.length - 1; index >= ${baselineTurns}; index--) {
          const turn = turns[index];
          const user = turn.matches('[data-message-author-role="user"]') ? turn : turn.querySelector('[data-message-author-role="user"]');
          if (user) return user.textContent;
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const text = result.result?.value;
    return typeof text === "string" && text.trim() ? browserPromptFingerprint(text) : undefined;
  } catch {
    return undefined;
  }
}
