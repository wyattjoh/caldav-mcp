import { test, expect } from "bun:test";
import { formatError } from "./errors";

test("formatError stringifies Error instances by message", () => {
  expect(formatError(new Error("boom"))).toBe("boom");
});

test("formatError stringifies plain objects as JSON", () => {
  expect(formatError({ code: 42 })).toBe('{"code":42}');
});

test("formatError falls back to String() for primitives", () => {
  expect(formatError(123)).toBe("123");
  expect(formatError(null)).toBe("null");
  expect(formatError(undefined)).toBe("undefined");
});
