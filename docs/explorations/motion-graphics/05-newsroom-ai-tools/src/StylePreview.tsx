import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const STYLE_PREVIEW_FPS = 30;
export const STYLE_PREVIEW_DURATION = 270;
export type StylePreviewVariant = 'editorial' | 'minimal' | 'data';

const NAMES = [
  'Benjamin Cher', 'Chloe Lim', 'Daniel Buenas', 'David Li Zuowei',
  'Ernie Chen', 'Gareth Chung JK', 'Ivan Tan', 'Jeanette Lee SS',
  'Tessa Oh', 'Vivien Ang CN', 'Yeo Cheng Yong',
];

const THEMES = {
  editorial: {bg: '#123a3c', alt: '#0b292b', fg: '#f3ead8', ink: '#172728', accent: '#f15a3d', signal: '#f0b845', quiet: '#9f9587'},
  minimal: {bg: '#071214', alt: '#10272b', fg: '#f4f0e8', ink: '#0b1719', accent: '#ff6547', signal: '#d8b55b', quiet: '#8e9a9b'},
  data: {bg: '#061c21', alt: '#0a2a30', fg: '#eff9f5', ink: '#071b20', accent: '#ff5c42', signal: '#55e1c0', quiet: '#6d9aa0'},
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const enter = (frame: number, from: number, to: number) => interpolate(frame, [from, to], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
const visibility = (frame: number, a: number, b: number, c: number, d: number) => Math.min(interpolate(frame, [a, b], [0, 1], clamp), interpolate(frame, [c, d], [1, 0], clamp));

type PreviewProps = {variant: StylePreviewVariant};
type Theme = (typeof THEMES)[StylePreviewVariant];

const Intro = ({variant, theme}: PreviewProps & {theme: Theme}) => {
  const frame = useCurrentFrame();
  const opacity = visibility(frame, 0, 10, 70, 88);
  const primary = enter(frame, 7, 31);
  const secondary = enter(frame, 21, 43);

  if (variant === 'editorial') {
    return <AbsoluteFill style={{opacity, padding: '78px 104px', boxSizing: 'border-box'}}>
      <div style={{color: theme.signal, font: '700 21px Courier New, monospace', letterSpacing: '.18em', opacity: secondary}}>SPH STAFF AWARDS • INNOVATION AWARD</div>
      <div style={{position: 'absolute', left: 96, top: 260, padding: '34px 48px 28px', background: theme.fg, color: theme.ink, font: '900 142px/.84 Arial Black, Impact, sans-serif', letterSpacing: '-.065em', transform: `translateX(${(1 - primary) * -140}px) rotate(-1deg)`, opacity: primary, boxShadow: '0 26px 44px rgba(0,0,0,.3)'}}>
        NEWSROOM<br/><span style={{color: theme.accent}}>AI TOOLS</span>
      </div>
      <div style={{position: 'absolute', left: 1030, top: 430, background: theme.signal, color: theme.ink, padding: '15px 24px', font: '900 22px Courier New, monospace', transform: `scale(${0.75 + secondary * .25}) rotate(3deg)`, opacity: secondary}}>STORY / DATA / HUMAN</div>
    </AbsoluteFill>;
  }

  if (variant === 'minimal') {
    return <AbsoluteFill style={{opacity, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      <div style={{color: theme.quiet, font: '700 20px Arial, sans-serif', letterSpacing: '.28em', opacity: secondary, marginBottom: 35}}>SPH STAFF AWARDS</div>
      <div style={{color: theme.fg, font: '800 136px/.9 Arial, sans-serif', letterSpacing: '-.07em', opacity: primary, transform: `translateY(${(1 - primary) * 54}px)`}}>Newsroom<br/><span style={{color: theme.accent}}>AI Tools</span></div>
      <div style={{width: 230 * secondary, height: 3, background: theme.signal, marginTop: 42}}/>
    </AbsoluteFill>;
  }

  return <AbsoluteFill style={{opacity, padding: '78px 104px', boxSizing: 'border-box'}}>
    <div style={{color: theme.signal, font: '800 20px Courier New, monospace', letterSpacing: '.18em', opacity: secondary}}>SIGNAL 152.00 • STORY ENGINE ONLINE</div>
    <div style={{position: 'absolute', left: 104, top: 250, color: theme.fg, font: '900 140px/.86 Arial Black, Impact, sans-serif', letterSpacing: '-.06em', opacity: primary, transform: `translateX(${(1 - primary) * -90}px)`}}>DATA BECOMES<br/><span style={{color: theme.accent}}>A STORY.</span></div>
    <div style={{position: 'absolute', left: 104, bottom: 126, width: 1500 * primary, height: 5, background: theme.signal}}/>
    <div style={{position: 'absolute', right: 104, bottom: 80, color: theme.quiet, font: '800 18px Courier New, monospace', letterSpacing: '.16em', opacity: secondary}}>NEWSROOM AI TOOLS</div>
  </AbsoluteFill>;
};

const Caption = ({variant, theme}: PreviewProps & {theme: Theme}) => {
  const frame = useCurrentFrame();
  const show = enter(frame, 102, 122);
  const text = 'Every day, the news changes. Somehow, the chores don’t.';

  if (variant === 'editorial') return <div style={{position: 'absolute', left: 210, right: 210, bottom: 76, background: theme.ink, color: theme.fg, borderLeft: `12px solid ${theme.accent}`, padding: '22px 30px 20px', font: '800 35px/1.18 Arial, sans-serif', opacity: show, transform: `translateY(${(1 - show) * 36}px) rotate(-.25deg)`, boxShadow: '0 14px 32px rgba(0,0,0,.28)'}}>{text}</div>;
  if (variant === 'minimal') return <div style={{position: 'absolute', left: 320, right: 320, bottom: 78, color: theme.fg, font: '650 35px/1.22 Arial, sans-serif', textAlign: 'center', opacity: show, transform: `translateY(${(1 - show) * 22}px)`, textShadow: '0 3px 16px rgba(0,0,0,.9)'}}><span style={{background: 'rgba(4,12,14,.84)', padding: '10px 18px'}}>{text}</span></div>;
  return <div style={{position: 'absolute', left: 118, right: 118, bottom: 66, display: 'flex', opacity: show, transform: `translateX(${(1 - show) * -48}px)`, fontFamily: 'Arial, sans-serif'}}>
    <div style={{background: theme.accent, color: theme.fg, font: '900 20px Courier New, monospace', letterSpacing: '.12em', padding: '20px 24px'}}>VO 01</div>
    <div style={{flex: 1, background: 'rgba(4,20,24,.94)', color: theme.fg, borderTop: `2px solid ${theme.signal}`, padding: '17px 26px 16px', fontSize: 34, fontWeight: 750}}>{text}</div>
  </div>;
};

const Placeholder = ({variant, theme}: PreviewProps & {theme: Theme}) => {
  const frame = useCurrentFrame();
  const opacity = visibility(frame, 68, 88, 190, 208);
  const card = enter(frame, 77, 103);

  if (variant === 'editorial') return <AbsoluteFill style={{opacity, padding: '76px 104px', boxSizing: 'border-box'}}>
    <div style={{color: theme.signal, font: '800 20px Courier New, monospace', letterSpacing: '.18em'}}>SCENE 01 • THE DAILY LOOP</div>
    <div style={{position: 'absolute', left: 270, right: 270, top: 168, bottom: 196, background: theme.fg, color: theme.ink, padding: '50px 58px', transform: `translateY(${(1 - card) * 90}px) rotate(-1deg)`, opacity: card, boxShadow: '0 28px 54px rgba(0,0,0,.34)'}}>
      <div style={{font: '900 22px Courier New, monospace', letterSpacing: '.14em', color: theme.accent}}>VISUAL PLACEHOLDER</div>
      <div style={{font: '900 84px/.92 Arial Black, Impact, sans-serif', letterSpacing: '-.055em', marginTop: 42}}>EVERY DAY,<br/>THE NEWS CHANGES.</div>
      <div style={{position: 'absolute', right: 44, bottom: 34, font: '800 18px Courier New, monospace', color: theme.quiet}}>FINAL CLIP DROPS HERE →</div>
    </div><Caption variant={variant} theme={theme}/>
  </AbsoluteFill>;

  if (variant === 'minimal') return <AbsoluteFill style={{opacity, padding: '76px 104px', boxSizing: 'border-box'}}>
    <div style={{color: theme.quiet, font: '700 18px Arial, sans-serif', letterSpacing: '.24em'}}>01 / THE DAILY LOOP</div>
    <div style={{position: 'absolute', left: 230, right: 230, top: 148, bottom: 205, border: '2px solid rgba(244,240,232,.42)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: card, transform: `scale(${.965 + card * .035})`}}>
      <div style={{width: 52, height: 3, background: theme.accent, marginBottom: 30}}/>
      <div style={{color: theme.fg, font: '750 86px/.98 Arial, sans-serif', letterSpacing: '-.055em', textAlign: 'center'}}>Every day,<br/>the news changes.</div>
      <div style={{color: theme.quiet, font: '700 17px Arial, sans-serif', letterSpacing: '.2em', marginTop: 38}}>PLACEHOLDER • FINAL VISUAL TO COME</div>
    </div><Caption variant={variant} theme={theme}/>
  </AbsoluteFill>;

  return <AbsoluteFill style={{opacity, padding: '76px 104px', boxSizing: 'border-box'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', color: theme.signal, font: '800 18px Courier New, monospace', letterSpacing: '.13em'}}><span>SCENE_01 / INPUT</span><span>00:00:01:22</span></div>
    <div style={{position: 'absolute', left: 104, right: 104, top: 150, bottom: 190, border: `2px solid ${theme.signal}`, display: 'grid', gridTemplateColumns: '1fr 310px', opacity: card, transform: `translateX(${(1 - card) * 60}px)`, background: 'rgba(4,20,24,.62)'}}>
      <div style={{padding: '60px 64px'}}><div style={{color: theme.accent, font: '900 20px Courier New, monospace', letterSpacing: '.14em'}}>VISUAL PLACEHOLDER</div><div style={{color: theme.fg, font: '900 82px/.92 Arial Black, Impact, sans-serif', letterSpacing: '-.055em', marginTop: 44}}>EVERY DAY,<br/>THE NEWS CHANGES.</div></div>
      <div style={{borderLeft: `1px solid ${theme.quiet}`, padding: '40px 32px', font: '700 17px/2.1 Courier New, monospace', color: theme.quiet}}><div style={{color: theme.signal}}>FORMAT / 16:9</div><div>STATUS / PENDING</div><div>CAPTION / READY</div><div>AUDIO / LOCKED</div><div style={{height: 80, marginTop: 24, borderBottom: `3px solid ${theme.accent}`, transform: 'skewY(-10deg)'}}/></div>
    </div><Caption variant={variant} theme={theme}/>
  </AbsoluteFill>;
};

const Credits = ({variant, theme}: PreviewProps & {theme: Theme}) => {
  const frame = useCurrentFrame();
  const opacity = visibility(frame, 188, 208, 254, 270);
  const title = enter(frame, 197, 219);
  const minimal = variant === 'minimal';
  return <AbsoluteFill style={{opacity, padding: minimal ? '74px 220px' : '70px 104px', boxSizing: 'border-box'}}>
    <div style={{color: theme.signal, font: minimal ? '700 18px Arial, sans-serif' : '800 18px Courier New, monospace', letterSpacing: '.18em', textAlign: minimal ? 'center' : 'left', opacity: title}}>TEAM BEHIND BT / NEWSROOM AI TOOLS</div>
    <div style={{color: theme.fg, font: minimal ? '750 54px/.98 Arial, sans-serif' : '900 58px/.95 Arial Black, Impact, sans-serif', letterSpacing: '-.045em', marginTop: 24, textAlign: minimal ? 'center' : 'left', opacity: title, transform: `translateY(${(1 - title) * 30}px)`}}>More time for the work that matters.</div>
    <div style={{display: 'grid', gridTemplateColumns: minimal ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: variant === 'data' ? '10px 18px' : '12px 42px', marginTop: 42, padding: variant === 'editorial' ? '26px 34px' : 0, background: variant === 'editorial' ? theme.fg : 'transparent', color: variant === 'editorial' ? theme.ink : theme.fg, transform: variant === 'editorial' ? 'rotate(.35deg)' : undefined}}>
      {NAMES.map((name, index) => {const show = enter(frame, 208 + index * 2, 221 + index * 2); return <div key={name} style={{borderBottom: variant === 'data' ? `1px solid ${theme.quiet}` : variant === 'editorial' ? `2px solid ${theme.bg}` : 'none', color: variant === 'data' && index % 3 === 0 ? theme.signal : undefined, font: variant === 'data' ? '750 21px Courier New, monospace' : '750 23px Arial, sans-serif', padding: variant === 'data' ? '9px 12px' : '7px 4px', opacity: show, transform: `translateY(${(1 - show) * 16}px)`, textAlign: minimal ? 'center' : 'left'}}>{name}</div>;})}
    </div>
    <div style={{position: 'absolute', left: minimal ? 0 : 104, right: minimal ? 0 : undefined, bottom: 45, color: variant === 'data' ? theme.signal : theme.fg, font: minimal ? '700 18px Arial, sans-serif' : '800 18px Courier New, monospace', letterSpacing: '.13em', textAlign: minimal ? 'center' : 'left', opacity: title}}>VIDEO MADE WITH CODEX + SEEDANCE</div>
  </AbsoluteFill>;
};

export const StylePreview = ({variant}: PreviewProps) => {
  const frame = useCurrentFrame();
  const theme = THEMES[variant];
  const volume = interpolate(frame, [0, 18, 230, 269], [0, .1, .1, 0], clamp);
  return <AbsoluteFill style={{background: variant === 'minimal' ? `radial-gradient(circle at 50% 35%, ${theme.alt}, ${theme.bg} 70%)` : theme.bg, overflow: 'hidden'}}>
    {variant === 'data' ? <AbsoluteFill style={{opacity: .2, backgroundImage: `linear-gradient(${theme.signal} 1px, transparent 1px), linear-gradient(90deg, ${theme.signal} 1px, transparent 1px)`, backgroundSize: '72px 72px', transform: `translateY(${(frame % 72) - 72}px)`}}/> : null}
    {variant === 'editorial' ? <AbsoluteFill style={{opacity: .1, backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 6px, rgba(255,255,255,.14) 7px)'}}/> : null}
    <Audio src={staticFile('assets/music.mp3')} volume={volume}/>
    <Intro variant={variant} theme={theme}/><Placeholder variant={variant} theme={theme}/><Credits variant={variant} theme={theme}/>
  </AbsoluteFill>;
};
