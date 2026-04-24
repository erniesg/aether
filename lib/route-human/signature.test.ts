import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign as nodeSign, KeyObject } from 'node:crypto';
import { verifyDiscordSignature } from './signature';

function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  // The raw Ed25519 public key is the last 32 bytes of the SPKI DER.
  const rawPub = der.subarray(der.length - 32);
  return { publicHex: rawPub.toString('hex'), privateKey };
}

function signPayload(privateKey: KeyObject, timestamp: string, body: string): string {
  const msg = Buffer.from(timestamp + body, 'utf8');
  return nodeSign(null, msg, privateKey).toString('hex');
}

describe('verifyDiscordSignature', () => {
  it('returns true for a correctly signed payload', () => {
    const { publicHex, privateKey } = makeKeypair();
    const timestamp = '1714000000';
    const body = JSON.stringify({ type: 1 });
    const signature = signPayload(privateKey, timestamp, body);

    expect(
      verifyDiscordSignature({ publicKey: publicHex, signature, timestamp, body })
    ).toBe(true);
  });

  it('returns false if the body was tampered with', () => {
    const { publicHex, privateKey } = makeKeypair();
    const timestamp = '1714000000';
    const body = JSON.stringify({ type: 1 });
    const signature = signPayload(privateKey, timestamp, body);
    const tamperedBody = JSON.stringify({ type: 2 });

    expect(
      verifyDiscordSignature({
        publicKey: publicHex,
        signature,
        timestamp,
        body: tamperedBody,
      })
    ).toBe(false);
  });

  it('returns false if the signature was forged with a different key', () => {
    const { publicHex } = makeKeypair();
    const { privateKey: otherPriv } = makeKeypair();
    const timestamp = '1714000000';
    const body = JSON.stringify({ type: 3 });
    const signature = signPayload(otherPriv, timestamp, body);

    expect(
      verifyDiscordSignature({ publicKey: publicHex, signature, timestamp, body })
    ).toBe(false);
  });

  it('returns false when inputs are missing or malformed', () => {
    expect(
      verifyDiscordSignature({ publicKey: '', signature: 'deadbeef', timestamp: '1', body: '' })
    ).toBe(false);
    expect(
      verifyDiscordSignature({
        publicKey: 'not-hex',
        signature: 'deadbeef',
        timestamp: '1',
        body: '',
      })
    ).toBe(false);
    expect(
      verifyDiscordSignature({
        publicKey: 'aa'.repeat(32),
        signature: 'not-hex',
        timestamp: '1',
        body: '',
      })
    ).toBe(false);
  });
});
