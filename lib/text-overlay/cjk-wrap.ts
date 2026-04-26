/**
 * CJK-aware line wrapping for zh-Hans text.
 *
 * Segmentation: Forward Maximum Matching with an embedded compact dictionary.
 * Zero dependencies, pure JS — runs in Node.js, Cloudflare Workers, browser.
 *
 * Width units: Han char = 1 col, ASCII char = 0.55 col (matches compose.ts).
 */

// Common compound words. Greedy FMM tries longest match first.
const DICT: ReadonlySet<string> = new Set([
  // 2-char
  '一冷', '一暖', '安眠', '守护', '登陆', '试睡', '每夜', '正式',
  '每次', '呼吸', '调温', '控温', '智能', '自动', '记录', '推出',
  '保暖', '散热', '冷暖', '舒适', '科技', '睡眠', '健康', '追踪',
  '可持', '发展', '持续', '环保', '绿色', '创新', '产品', '服务',
  '功能', '体验', '数据', '系统', '平台', '应用', '管理', '优化',
  '效果', '质量', '价格', '活动', '促销', '限时', '特惠', '优惠',
  '品牌', '合作', '专业', '团队', '支持', '解决', '方案', '提供',
  '用户', '客户', '需求', '满足', '实现', '完成', '成功', '结果',
  '开始', '进行', '使用', '操作', '设置', '配置', '安装',
  '新加坡',
  // 3-char
  '可持续', '正式版', '每夜安', '静静守', '智能化',
  '自动化', '人工智', '高科技', '新技术', '现代化', '专业化',
  // 4-char
  '无忧试睡', '可持续发', '智能控温', '一冷一暖', '静静守护',
  '每夜安眠', '新加坡正', '正式登陆', '自动调温',
  // 5-char
  '无忧试睡期', '可持续发展', '智能温控系', '新加坡正式',
  // 6-char
  '可持续发展性', '新加坡正式登',
]);

const MAX_WORD_LEN = 6;

// CJK Unified Ideographs range (U+4E00..U+9FFF) plus extensions
function isCjk(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x3000 && cp <= 0x303f) || // CJK symbols & punctuation
    (cp >= 0xff00 && cp <= 0xffef)    // fullwidth forms
  );
}

// Punctuation that must never start a line (stays on current line even at overflow)
const TRAILING_PUNCT_CP = new Set([
  0xff0c, // fullwidth comma
  0x3002, // ideographic full stop
  0xff01, // fullwidth exclamation
  0xff1f, // fullwidth question mark
  0x3001, // ideographic comma
  0xff1b, // fullwidth semicolon
  0xff1a, // fullwidth colon
  0x300d, // right corner bracket
  0x300f, // right white corner bracket
  0x300b, // right double angle bracket
  0x3009, // right angle bracket
  0xff09, // fullwidth right parenthesis
  0x3015, // right tortoise shell bracket
  0x3011, // right black lenticular bracket
  0x3017, // right white lenticular bracket
  0x00b7, // middle dot
  0x2026, // horizontal ellipsis
  0x2014, // em dash
  0x201d, // right double quotation mark
  0x2019, // right single quotation mark
]);

function isTrailingPunct(ch: string): boolean {
  return TRAILING_PUNCT_CP.has(ch.codePointAt(0) ?? 0);
}

// ---------------------------------------------------------------------------
// Tokeniser: FMM over CJK chars; Latin/digit runs are collected as one token.
// ---------------------------------------------------------------------------
function tokenise(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
      continue;
    }

    if (isCjk(ch)) {
      let matched = false;
      for (let len = MAX_WORD_LEN; len >= 2; len--) {
        const candidate = text.slice(i, i + len);
        if (candidate.length === len && DICT.has(candidate)) {
          tokens.push(candidate);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        tokens.push(ch);
        i++;
      }
      continue;
    }

    // Latin / ASCII run
    let j = i + 1;
    while (j < text.length && !/\s/.test(text[j]) && !isCjk(text[j])) {
      j++;
    }
    tokens.push(text.slice(i, j));
    i = j;
  }
  return tokens;
}

// Width in approximate column units (matches tokenWidth in compose.ts)
function tokWidth(tok: string): number {
  if (/^\s+$/.test(tok)) return tok.length * 0.3;
  let w = 0;
  for (const ch of tok) {
    w += isCjk(ch) ? 1.0 : 0.55;
  }
  return w;
}

// ---------------------------------------------------------------------------
// Greedy line-break with punctuation-prefer-break heuristic.
// ---------------------------------------------------------------------------
export function wrapZhHans(text: string, widthCols: number): string[] {
  if (!text || widthCols <= 0) return text ? [text] : [];

  const tokens = tokenise(text);
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      if (current.length === 0) continue;
      current += tok;
      currentWidth += tokWidth(tok);
      continue;
    }

    const w = tokWidth(tok);

    if (currentWidth + w > widthCols && current.length > 0) {
      const isPunct = tok.length === 1 && isTrailingPunct(tok);

      if (isPunct) {
        // Keep punctuation on current line; flush after it
        current += tok;
        currentWidth += w;
        lines.push(current.trimEnd());
        current = '';
        currentWidth = 0;
      } else {
        lines.push(current.trimEnd());
        current = tok;
        currentWidth = w;
      }
    } else {
      current += tok;
      currentWidth += w;
    }
  }

  if (current.trim().length > 0) lines.push(current.trimEnd());
  return lines;
}
