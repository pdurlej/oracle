import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import { render } from "markdansi";
import type { ChromeClient } from "./types.js";
import { buildConversationTurnListExpression } from "./conversationTurns.js";

export function normalizeBrowserPromptText(value: unknown): string {
  return String(value ?? "")
    .replace(/```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderLegacyBrowserPrompt(value: string): string {
  // OSC links retain their labels without appending destinations to the displayed text.
  const rendered = render(value, {
    color: true,
    hyperlinks: true,
    wrap: false,
    codeBox: false,
    codeGutter: false,
    codeWrap: false,
    quotePrefix: "",
    tableBorder: "none",
    tablePadding: 0,
    tableTruncate: false,
  });
  return normalizeBrowserPromptText(
    stripVTControlCharacters(rendered).replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, ""),
  );
}

export function browserPromptFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(String(value ?? "").replace(/\r\n?/g, "\n"))
    .digest("hex");
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
          if (user) return user.textContent;
        }
        return null;
      })()`,
        returnByValue: true,
      });
      const text = result.result?.value;
      if (typeof text === "string" && text.trim()) return browserPromptFingerprint(text);
    } catch {
      return undefined;
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  }
}
