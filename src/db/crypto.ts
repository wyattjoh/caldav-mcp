import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = { ciphertext: Uint8Array; nonce: Uint8Array };

export const encryptSecret = (plaintext: string, key: Uint8Array): EncryptedSecret => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Uint8Array.from(Buffer.concat([enc, tag])),
    nonce: Uint8Array.from(nonce),
  };
};

export const decryptSecret = (
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): string => {
  if (ciphertext.length < 16) throw new Error("ciphertext too short");
  const tag = Buffer.from(ciphertext.slice(ciphertext.length - 16));
  const enc = Buffer.from(ciphertext.slice(0, ciphertext.length - 16));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(nonce));
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
};
