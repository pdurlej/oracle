import { expect, test } from "vitest";
import {
  browserPromptFingerprint,
  readSubmittedPromptFingerprint,
  resolveSubmittedPromptBaseline,
} from "../../src/browser/promptFingerprint.js";
import type { ChromeClient } from "../../src/browser/types.js";

test("recovers the submitted user turn when the first count was unavailable and an answer is already present", async () => {
  const turns = ["Old user", null, "New committed user", null].map((text) => ({
    matches: () => false,
    querySelector: () => (text === null ? null : { textContent: text }),
  }));
  const runtime = {
    evaluate: async ({ expression }: { expression: string }) => ({
      result: {
        value: new Function("document", `return ${expression}`)({ querySelectorAll: () => turns }),
      },
    }),
  } as unknown as ChromeClient["Runtime"];
  const baseline = resolveSubmittedPromptBaseline(null, 3);
  await expect(readSubmittedPromptFingerprint(runtime, baseline)).resolves.toBe(
    browserPromptFingerprint("New committed user", 2),
  );
  expect(resolveSubmittedPromptBaseline(2, 3)).toBe(2);
});

test("fingerprints preserve case and meaningful indentation", () => {
  expect(browserPromptFingerprint("Foo", 0)).not.toBe(browserPromptFingerprint("foo", 0));
  expect(browserPromptFingerprint("if active:\n  run()\nfinish()", 0)).not.toBe(
    browserPromptFingerprint("if active:\n  run()\n  finish()", 0),
  );
  expect(browserPromptFingerprint("one\r\ntwo", 0)).toBe(browserPromptFingerprint("one\ntwo", 0));
  expect(browserPromptFingerprint("Continue", 0)).not.toBe(browserPromptFingerprint("Continue", 2));
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
    browserPromptFingerprint(text, 0),
  );
  await expect(readSubmittedPromptFingerprint(runtime, 1)).resolves.toBeUndefined();
  expect(browserPromptFingerprint(text, 0)).not.toBe(
    browserPromptFingerprint(
      "# Heading\n[spec](https://example.com)\n```python\nif active:\n  run()\n```",
      0,
    ),
  );
});

test("waits for asynchronous user-turn mounting within the configured input timeout", async () => {
  let calls = 0;
  const runtime = {
    evaluate: async () => ({
      result: { value: ++calls === 1 ? null : { text: "Mounted user prompt", turnIndex: 0 } },
    }),
  } as unknown as ChromeClient["Runtime"];
  await expect(readSubmittedPromptFingerprint(runtime, 0, 1000)).resolves.toBe(
    browserPromptFingerprint("Mounted user prompt", 0),
  );
  expect(calls).toBe(2);
});

test("retries a replaced execution context without treating a closed connection as transient", async () => {
  let calls = 0;
  const runtime = {
    evaluate: async () => {
      if (++calls === 1) throw new Error("Protocol error: Execution context was destroyed");
      return { result: { value: { text: "Committed prompt", turnIndex: 0 } } };
    },
  } as unknown as ChromeClient["Runtime"];
  await expect(readSubmittedPromptFingerprint(runtime, 0, 1000)).resolves.toBe(
    browserPromptFingerprint("Committed prompt", 0),
  );
  expect(calls).toBe(2);
  calls = 0;
  runtime.evaluate = async () => {
    calls++;
    throw new Error("WebSocket is not open");
  };
  await expect(readSubmittedPromptFingerprint(runtime, 0, 1000)).resolves.toBeUndefined();
  expect(calls).toBe(1);
});
