import React, { useState } from 'react';
import { OffthreadVideo, Img } from 'remotion';
import type { RecapPost } from '../data';
import { theme } from '../theme';

interface Props {
  post: RecapPost;
  /** Render compact (smaller paddings + smaller media). */
  compact?: boolean;
}

const fmt = (n?: number) => {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

/**
 * X post tile used by MomentScene + the in-page hero reel. Same shape
 * as the HTML mock at docs/mocks/aie2026-recap-mock.html — verified
 * checkmark, handle, time, post text with em-emphasis, media area
 * (image or autoplaying video), 4 X-style stat counters.
 */
export const XPostCard: React.FC<Props> = ({ post, compact = false }) => {
  const av = (
    <div
      style={{
        width: compact ? 36 : 56,
        height: compact ? 36 : 56,
        borderRadius: 999,
        background: 'linear-gradient(135deg, #4a2814, #de7340)',
        color: '#fff',
        fontFamily: theme.serif,
        fontSize: compact ? 18 : 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      {post.authorName.charAt(0)}
    </div>
  );

  const verified = post.verified ? (
    <svg
      viewBox="0 0 24 24"
      style={{ width: compact ? 16 : 22, height: compact ? 16 : 22, fill: '#1d9bf0', flex: '0 0 auto' }}
    >
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  ) : null;

  const renderMedia = () => {
    if (!post.media) return null;
    const wrapStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      aspectRatio: '16 / 9',
      background: '#000',
      overflow: 'hidden',
      borderRadius: 14,
      border: `1px solid ${theme.lineStrong}`,
      marginTop: 14,
    };
    if (post.media.type === 'video') {
      return (
        <div style={wrapStyle}>
          <VideoWithFallback src={post.media.url} />
          <span style={tagStyle}>x video · {fmt(post.metrics.views)} views</span>
          <span style={badgeStyle}>▶ {formatDuration(post.media.durationMs)}</span>
        </div>
      );
    }
    return (
      <div style={wrapStyle}>
        <Img src={post.media.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <span style={tagStyle}>x · {fmt(post.metrics.views)} views</span>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${compact ? 36 : 56}px 1fr`,
        gap: compact ? 12 : 18,
        padding: compact ? 16 : 22,
        background: '#0f0c0a',
        border: `1px solid #2a1f18`,
        borderRadius: 18,
        color: theme.ink,
        fontFamily: theme.sans,
      }}
    >
      {av}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#fff', fontSize: compact ? 16 : 22 }}>
            {post.authorName}
          </span>
          {verified}
          <span style={{ color: theme.muted, fontSize: compact ? 14 : 18 }}>{post.authorHandle}</span>
          <span style={{ color: theme.muted, fontSize: compact ? 14 : 18 }}>
            · {post.postedAt ? new Date(post.postedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : ''}
          </span>
        </div>
        <p
          style={{
            margin: '8px 0 0',
            color: '#fff',
            fontSize: compact ? 15 : 22,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderText(post.text)}
        </p>
        {renderMedia()}
        <div
          style={{
            marginTop: compact ? 12 : 18,
            display: 'flex',
            gap: compact ? 20 : 32,
            color: theme.muted,
            fontSize: compact ? 13 : 18,
          }}
        >
          <Stat icon="reply" value={post.metrics.replies} compact={compact} />
          <Stat icon="repost" value={post.metrics.reposts} compact={compact} />
          <Stat icon="like" value={post.metrics.likes} compact={compact} />
          <Stat icon="view" value={post.metrics.views} compact={compact} />
        </div>
      </div>
    </div>
  );
};

/**
 * OffthreadVideo with onError fallback — if the remote video can't be
 * decoded by headless Chrome during render, we silently swap to a styled
 * placeholder so the scene still composes cleanly. Production renderer
 * should pre-download videos to public/ (see scripts/render-recap.ts).
 */
const VideoWithFallback: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(135deg, #2a1a10 0%, #de7340 100%), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), transparent 50%)',
        }}
      />
    );
  }
  return (
    <OffthreadVideo
      src={src}
      muted
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

// ───────── helpers ─────────

function renderText(text: string) {
  // very light markup: text in literal quotes gets the accent color
  const parts = text.split(/(".+?")/g);
  return parts.map((part, i) => {
    if (part.startsWith('"') && part.endsWith('"')) {
      return (
        <span key={i} style={{ color: theme.accent }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function formatDuration(ms?: number) {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const tagStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  top: 12,
  zIndex: 2,
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  padding: '4px 8px',
  fontFamily: theme.mono,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  bottom: 12,
  zIndex: 2,
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  padding: '4px 8px',
  fontFamily: theme.mono,
  fontSize: 12,
};

const Stat: React.FC<{ icon: 'reply' | 'repost' | 'like' | 'view'; value?: number; compact?: boolean }> = ({
  icon,
  value,
  compact,
}) => {
  const size = compact ? 16 : 22;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={size} />
      <b style={{ fontWeight: 500, color: theme.muted }}>{fmt(value)}</b>
    </span>
  );
};

const Icon: React.FC<{ name: 'reply' | 'repost' | 'like' | 'view'; size: number }> = ({ name, size }) => {
  const common = { width: size, height: size, fill: theme.muted };
  switch (name) {
    case 'reply':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
        </svg>
      );
    case 'repost':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
        </svg>
      );
    case 'like':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
        </svg>
      );
    case 'view':
      return (
        <svg viewBox="0 0 24 24" style={common}>
          <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
        </svg>
      );
  }
};
