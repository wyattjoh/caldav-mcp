import { test, expect } from "bun:test";
import { createRateLimiter } from "./rate-limit";

test("rate limiter allows up to limit attempts per window", () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 3, windowMs: 1000, now: () => now });
  expect(rl.check("k")).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(rl.check("k")).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(rl.check("k")).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(rl.check("k").allowed).toBe(false);
});

test("rate limiter resets after window slides", () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  rl.check("k");
  rl.check("k");
  expect(rl.check("k").allowed).toBe(false);
  now += 1001;
  expect(rl.check("k").allowed).toBe(true);
});

test("separate keys are independent", () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
  expect(rl.check("a").allowed).toBe(true);
  expect(rl.check("b").allowed).toBe(true);
  expect(rl.check("a").allowed).toBe(false);
});
