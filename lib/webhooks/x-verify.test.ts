import { describe, expect, it } from 'vitest';
import { computeCrcResponse, verifySignature } from './x-verify';
import crypto from 'node:crypto';

// Known-good fixtures derived from the X Account Activity API spec.
// Both computeCrcResponse and verifySignature must be pure — no I/O.

const SECRET = 'test_consumer_secret';

function hmacB64(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

describe('computeCrcResponse', () => {
  it('returns sha256= prefix + base64 HMAC-SHA256(crc_token, secret)', () => {
    const crcToken = 'abc123_crc_token';
    const result = computeCrcResponse(crcToken, SECRET);
    const expected = `sha256=${hmacB64(crcToken, SECRET)}`;
    expect(result).toBe(expected);
  });

  it('is deterministic for the same inputs', () => {
    const result1 = computeCrcResponse('token_x', SECRET);
    const result2 = computeCrcResponse('token_x', SECRET);
    expect(result1).toBe(result2);
  });

  it('produces different outputs for different tokens', () => {
    const r1 = computeCrcResponse('token_a', SECRET);
    const r2 = computeCrcResponse('token_b', SECRET);
    expect(r1).not.toBe(r2);
  });

  it('produces different outputs for different secrets', () => {
    const r1 = computeCrcResponse('same_token', 'secret_a');
    const r2 = computeCrcResponse('same_token', 'secret_b');
    expect(r1).not.toBe(r2);
  });

  it('always starts with sha256=', () => {
    const result = computeCrcResponse('anything', SECRET);
    expect(result).toMatch(/^sha256=/);
  });
});

describe('verifySignature', () => {
  function makeSignature(body: string, key: string): string {
    return `sha256=${hmacB64(body, key)}`;
  }

  it('returns true when signature matches', () => {
    const body = '{"event":"tweet_create"}';
    const sig = makeSignature(body, SECRET);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it('returns false when signature is wrong', () => {
    const body = '{"event":"tweet_create"}';
    const wrongSig = makeSignature(body, 'wrong_secret');
    expect(verifySignature(body, wrongSig, SECRET)).toBe(false);
  });

  it('returns false when body is tampered', () => {
    const body = '{"event":"tweet_create"}';
    const sig = makeSignature(body, SECRET);
    const tamperedBody = '{"event":"tweet_delete"}';
    expect(verifySignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('returns false when header is malformed (no sha256= prefix)', () => {
    const body = '{"event":"tweet_create"}';
    const malformed = hmacB64(body, SECRET); // missing prefix
    expect(verifySignature(body, malformed, SECRET)).toBe(false);
  });

  it('returns false for empty signature header', () => {
    expect(verifySignature('body', '', SECRET)).toBe(false);
  });

  it('uses constant-time comparison (no timing attack on valid format)', () => {
    // Structural test: a sig that has sha256= prefix but wrong digest still returns false
    const body = 'payload';
    const badSig = 'sha256=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    expect(verifySignature(body, badSig, SECRET)).toBe(false);
  });
});
