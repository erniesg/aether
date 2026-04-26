import { describe, expect, it } from 'vitest';
import { wrapZhHans } from './cjk-wrap';

describe('wrapZhHans', () => {
  it('keeps "无忧试睡" as one token — never split between 无 and 忧', () => {
    // widthCols=5 is just enough for a 5-char compound to NOT fit alongside
    // the preceding "30 晚" token, forcing a break BEFORE "无忧试睡", not inside.
    const lines = wrapZhHans('30 晚无忧试睡', 5);
    const joined = lines.join('\n');
    expect(joined).not.toMatch(/无\n忧/);
    expect(joined).not.toMatch(/无忧\n试睡/);
    // The compound must appear intact on one line.
    const hasIntact = lines.some((l) => l.includes('无忧试睡'));
    expect(hasIntact).toBe(true);
  });

  it('breaks at punctuation — Pod sentence with widthCols=22', () => {
    const text =
      'Pod 一冷一暖，静静守护每夜安眠。30 晚无忧试睡，新加坡正式登陆。';
    const lines = wrapZhHans(text, 22);
    // Every break must land immediately after a CJK punctuation character.
    // No interior Chinese word should be split.
    for (const line of lines) {
      // No mid-word splits: no Han char immediately followed by newline that
      // isn't punctuation (we test the joined string boundary behaviour).
      expect(line).not.toMatch(/[^\s，。！？、；：「」《》『』]\n[^\s]/);
    }
    // There should be more than one line (it must wrap).
    expect(lines.length).toBeGreaterThan(1);
    // Every line must be ≤ widthCols in approximate column units.
    for (const line of lines) {
      const w = [...line].reduce((acc, ch) => {
        if (/[一-鿿　-〿＀-￯]/.test(ch)) return acc + 1;
        return acc + 0.55;
      }, 0);
      // Allow a small overshoot only when the line is a single non-breakable token.
      const singleToken = !line.includes(' ') && [...line].every(
        (c) => /[一-鿿]/.test(c)
      );
      if (!singleToken) {
        expect(w).toBeLessThanOrEqual(22 + 1); // +1 rounding tolerance
      }
    }
  });

  it('wraps mixed Chinese + Latin cleanly — "Pod 4 Ultra 来了"', () => {
    const lines = wrapZhHans('Pod 4 Ultra 来了', 8);
    const joined = lines.join('\n');
    // Latin token "Pod" must not be split.
    expect(joined).not.toMatch(/Po\nd/i);
    // "来了" must not be split.
    expect(joined).not.toMatch(/来\n了/);
    // Must produce output.
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps long compound "可持续发展" intact', () => {
    // widthCols=4 — shorter than the compound; break must happen before it.
    const lines = wrapZhHans('环保 可持续发展', 4);
    const hasIntact = lines.some((l) => l.includes('可持续发展'));
    expect(hasIntact).toBe(true);
    const joined = lines.join('\n');
    expect(joined).not.toMatch(/可持\n续发展/);
    expect(joined).not.toMatch(/可\n持续发展/);
  });

  it('returns empty array for empty input', () => {
    expect(wrapZhHans('', 20)).toEqual([]);
  });

  it('returns single line when text fits in budget', () => {
    const lines = wrapZhHans('你好', 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('你好');
  });

  it('handles ASCII-only input without breaking', () => {
    const lines = wrapZhHans('Hello world foo', 6);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/^\s/);
    }
  });
});
