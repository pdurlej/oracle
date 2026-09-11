import { expect, test } from "vitest";
import {
  browserPromptFingerprint,
  readSubmittedPromptFingerprint,
} from "../../src/browser/promptFingerprint.js";
import type { ChromeClient } from "../../src/browser/types.js";

test("fingerprints preserve case and meaningful indentation", () => {
  expect(browserPromptFingerprint("Foo")).not.toBe(browserPromptFingerprint("foo"));
  expect(browserPromptFingerprint("if active:\n  run()\nfinish()")).not.toBe(
    browserPromptFingerprint("if active:\n  run()\n  finish()"),
  );
  expect(browserPromptFingerprint("one\r\ntwo")).toBe(browserPromptFingerprint("one\ntwo"));
});

test("captures the rendered committed user turn rather than Markdown source", async () => {
  const text = "Heading\nspec\nif active:\n  run()";
  const user = { textContent: text };
  const turn = { matches: () => false, querySelector: () => user };
  const runtime = {
    evaluate: async ({ expression }: { expression: string }) => ({
      result: {
        value: new Function("document", `return ${expression}`)({ querySelectorAll: () => [turn] }),
      },
    }),
  } as unknown as ChromeClient["Runtime"];

  await expect(readSubmittedPromptFingerprint(runtime, 0)).resolves.toBe(
    browserPromptFingerprint(text),
  );
  await expect(readSubmittedPromptFingerprint(runtime, 1)).resolves.toBeUndefined();
  expect(browserPromptFingerprint(text)).not.toBe(
    browserPromptFingerprint(
      "# Heading\n[spec](https://example.com)\n```python\nif active:\n  run()\n```",
    ),
  );
});
