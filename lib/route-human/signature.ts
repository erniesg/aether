import { Buffer } from 'node:buffer';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// SPKI DER prefix for an Ed25519 public key — prepended to the raw 32-byte
// key to form a valid SubjectPublicKeyInfo that `createPublicKey` accepts.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function ed25519PublicKeyFromHex(hex: string) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) {
    throw new Error('Ed25519 public key must be 32 bytes (64 hex chars)');
  }
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function verifyDiscordSignature(params: {
  publicKey: string;
  signature: string;
  timestamp: string;
  body: string;
}): boolean {
  const { publicKey, signature, timestamp, body } = params;
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const key = ed25519PublicKeyFromHex(publicKey);
    const sig = Buffer.from(signature, 'hex');
    if (sig.length !== 64) return false;
    const msg = Buffer.from(timestamp + body, 'utf8');
    return cryptoVerify(null, msg, key, sig);
  } catch {
    return false;
  }
}
