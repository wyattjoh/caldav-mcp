import { test, expect } from "bun:test";
import { encryptSecret, decryptSecret } from "./crypto";

const key = new Uint8Array(32).fill(7);

test("encrypt + decrypt round trip", () => {
  const { ciphertext, nonce } = encryptSecret("hunter2", key);
  expect(ciphertext).toBeInstanceOf(Uint8Array);
  expect(nonce).toHaveLength(12);
  expect(decryptSecret(ciphertext, nonce, key)).toBe("hunter2");
});

test("tampered ciphertext fails decryption", () => {
  const { ciphertext, nonce } = encryptSecret("hunter2", key);
  ciphertext[0] ^= 0x01;
  expect(() => decryptSecret(ciphertext, nonce, key)).toThrow();
});

test("wrong key fails decryption", () => {
  const { ciphertext, nonce } = encryptSecret("hunter2", key);
  const bad = new Uint8Array(32).fill(8);
  expect(() => decryptSecret(ciphertext, nonce, bad)).toThrow();
});
