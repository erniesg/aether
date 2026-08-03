import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Img, Sequence, staticFile} from 'remotion';
import {RoutineScene} from './scenes';
import {Tape, Texture} from './primitives';
import {THEMES} from './theme';

export type StyleboardVariant =
  | 'paper-collage'
  | 'newsprint-proof'
  | 'broadcast-slate'
  | 'wire-terminal'
  | 'product-keynote'
  | 'redline-edit';

export const STYLEBOARD_WIDTH = 1920;
export const STYLEBOARD_HEIGHT = 1200;

const SCENE_06_LINE =
  'This isn’t about automating journalism. It’s about removing the grunt work around it.';
const SCENE_03_LINE = 'When the market closes, the routine begins.';

const CREDITS = [
  'Benjamin Cher',
  'Chloe Lim',
  'Daniel Buenas',
  'David Li Zuowei',
  'Ernie Chen',
  'Gareth Chung JK',
  'Ivan Tan',
  'Jeanette Lee SS',
  'Tessa Oh',
  'Vivien Ang CN',
  'Yeo Cheng Yong',
];

const kirigami = THEMES.kirigami;
const newsprint = THEMES.newsprint;

const SLATE = {
  background: '#0e0f12',
  panel: '#15161b',
  ink: '#f4f2ec',
  quiet: 'rgba(244, 242, 236, 0.55)',
  accent: '#ff5c33',
  line: 'rgba(244, 242, 236, 0.16)',
  mono: '"Courier New", Courier, monospace',
  sans: 'Arial, Helvetica, sans-serif',
  headline: 'Arial Black, Impact, sans-serif',
};

const Scene06Frame = ({filter}: {filter?: string}) => (
  <Img
    src={staticFile('assets/preview-scene06-frame.jpg')}
    style={{width: '100%', height: '100%', objectFit: 'cover', filter}}
  />
);

/* ------------------------------------------------------------------ */
/* Variant A — Paper Collage (kirigami evolution)                      */
/* ------------------------------------------------------------------ */

const PaperChip = ({
  children,
  css,
}: {
  children: ReactNode;
  css?: CSSProperties;
}) => (
  <div
    style={{
      background: kirigami.accent2,
      color: kirigami.ink,
      fontFamily: kirigami.mono,
      fontSize: 19,
      fontWeight: 700,
      letterSpacing: '0.16em',
      padding: '11px 16px 9px',
      textTransform: 'uppercase',
      ...css,
    }}
  >
    {children}
  </div>
);

const PaperCollageIntro = () => (
  <AbsoluteFill style={{fontFamily: kirigami.body, overflow: 'hidden'}}>
    <Texture style="kirigami" />
    <PaperChip css={{position: 'absolute', left: 104, top: 86}}>
      SPH STAFF AWARDS • INNOVATION AWARD
    </PaperChip>
    <div
      style={{
        position: 'absolute',
        left: 104,
        top: 300,
        color: kirigami.paper,
        fontFamily: kirigami.headline,
        fontSize: 158,
        fontWeight: 900,
        letterSpacing: '-0.065em',
        lineHeight: 0.88,
      }}
    >
      NEWSROOM
      <br />
      <span style={{color: kirigami.accent}}>AI TOOLS</span>
    </div>
    <div
      style={{
        position: 'absolute',
        left: 108,
        top: 700,
        background: kirigami.paper,
        color: kirigami.ink,
        fontFamily: kirigami.mono,
        fontSize: 23,
        fontWeight: 700,
        letterSpacing: '0.14em',
        padding: '14px 22px 12px',
        transform: 'rotate(-1.4deg)',
        boxShadow: `0 18px 40px ${kirigami.shadow}`,
      }}
    >
      BT / THE BUSINESS TIMES
    </div>
    <div
      style={{
        position: 'absolute',
        left: 108,
        bottom: 96,
        width: 640,
        height: 6,
        background: kirigami.accent2,
      }}
    />
  </AbsoluteFill>
);

const PaperCollagePlaceholderChrome = () => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    <PaperChip css={{position: 'absolute', left: 66, top: 48, zIndex: 80}}>
      SCENE 03 • MARKET CLOSE
    </PaperChip>
    <div
      style={{
        position: 'absolute',
        right: 66,
        top: 48,
        zIndex: 80,
        background: kirigami.paper,
        color: kirigami.ink,
        fontFamily: kirigami.mono,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '0.12em',
        padding: '10px 15px 8px',
        textTransform: 'uppercase',
        transform: 'rotate(1.2deg)',
      }}
    >
      Visual placeholder
    </div>
    <div
      style={{
        position: 'absolute',
        left: 66,
        bottom: 74,
        zIndex: 80,
        maxWidth: 1050,
        background: kirigami.paper,
        borderLeft: `14px solid ${kirigami.accent}`,
        boxShadow: `0 20px 44px ${kirigami.shadow}`,
        color: kirigami.ink,
        fontFamily: kirigami.headline,
        fontSize: 44,
        fontWeight: 900,
        letterSpacing: '-0.03em',
        lineHeight: 1.05,
        padding: '26px 34px 22px',
        transform: 'rotate(-1.1deg)',
      }}
    >
      {SCENE_03_LINE}
      <Tape style="kirigami" css={{right: -44, top: -22, transform: 'rotate(8deg)'}} />
    </div>
  </AbsoluteFill>
);

const PaperCollagePlaceholder = () => (
  <AbsoluteFill style={{background: kirigami.backgroundAlt, overflow: 'hidden'}}>
    <Texture style="kirigami" intensity={0.9} />
    <Sequence from={-60} durationInFrames={260}>
      <RoutineScene style="kirigami" duration={200} />
    </Sequence>
    <PaperCollagePlaceholderChrome />
  </AbsoluteFill>
);

const PaperCollageScene06 = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <Scene06Frame filter="saturate(.85) contrast(1.04)" />
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(0deg, rgba(11,41,43,.72) 0%, rgba(11,41,43,.12) 34%, rgba(11,41,43,0) 55%)',
      }}
    />
    <PaperChip css={{position: 'absolute', left: 66, top: 48}}>
      SCENE 06 • LIVE FOOTAGE + NATIVE VO
    </PaperChip>
    <div
      style={{
        position: 'absolute',
        left: 66,
        bottom: 70,
        maxWidth: 1240,
        background: kirigami.paper,
        borderLeft: `14px solid ${kirigami.accent}`,
        boxShadow: `0 22px 48px ${kirigami.shadow}`,
        color: kirigami.ink,
        fontFamily: kirigami.headline,
        fontSize: 40,
        fontWeight: 900,
        letterSpacing: '-0.03em',
        lineHeight: 1.08,
        padding: '26px 34px 22px',
        transform: 'rotate(-0.8deg)',
      }}
    >
      {SCENE_06_LINE}
      <Tape style="kirigami" css={{left: -40, top: -20, transform: 'rotate(-9deg)'}} />
    </div>
  </AbsoluteFill>
);

const PaperCollageCredits = () => (
  <AbsoluteFill style={{fontFamily: kirigami.body, overflow: 'hidden'}}>
    <Texture style="kirigami" />
    <div
      style={{
        position: 'absolute',
        left: 104,
        top: 74,
        color: kirigami.accent2,
        fontFamily: kirigami.mono,
        fontSize: 21,
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}
    >
      CREDITS • THE TEAM BEHIND BT / NEWSROOM AI TOOLS
    </div>
    <div
      style={{
        position: 'absolute',
        left: 104,
        top: 128,
        color: kirigami.paper,
        fontFamily: kirigami.headline,
        fontSize: 78,
        fontWeight: 900,
        letterSpacing: '-0.05em',
      }}
    >
      More time for <span style={{color: kirigami.accent}}>the work that matters.</span>
    </div>
    <div
      style={{
        position: 'absolute',
        left: 104,
        right: 104,
        top: 296,
        background: kirigami.paper,
        boxShadow: `0 26px 52px ${kirigami.shadow}`,
        color: kirigami.ink,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        columnGap: 84,
        padding: '38px 44px',
        transform: 'rotate(-0.5deg)',
      }}
    >
      {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
        <div key={i} style={{display: 'grid', gap: 17}}>
          {column.map((name) => (
            <div
              key={name}
              style={{
                borderBottom: `2px solid ${kirigami.background}`,
                fontSize: 27,
                fontWeight: 800,
                paddingBottom: 9,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      ))}
      <Tape style="kirigami" css={{left: -46, top: -20, transform: 'rotate(-7deg)'}} />
      <Tape style="kirigami" css={{right: -46, bottom: -18, transform: 'rotate(6deg)'}} />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 104,
        bottom: 58,
        color: kirigami.paper,
        fontFamily: kirigami.mono,
        fontSize: 21,
        letterSpacing: '0.12em',
        opacity: 0.72,
        textTransform: 'uppercase',
      }}
    >
      Video made with Codex and Seedance
    </div>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Variant B — Newsprint Proof (broadsheet proof sheet)                */
/* ------------------------------------------------------------------ */

const CropMarks = () => {
  const mark = (css: CSSProperties, borders: CSSProperties) => (
    <div style={{position: 'absolute', width: 46, height: 46, ...borders, ...css}} />
  );
  const line = `4px solid ${newsprint.ink}`;
  return (
    <>
      {mark({left: 40, top: 40}, {borderLeft: line, borderTop: line})}
      {mark({right: 40, top: 40}, {borderRight: line, borderTop: line})}
      {mark({left: 40, bottom: 40}, {borderLeft: line, borderBottom: line})}
      {mark({right: 40, bottom: 40}, {borderRight: line, borderBottom: line})}
    </>
  );
};

const FpoStamp = ({css}: {css?: CSSProperties}) => (
  <div
    style={{
      position: 'absolute',
      border: `6px solid ${newsprint.accent}`,
      outline: `2px solid ${newsprint.accent}`,
      outlineOffset: 5,
      color: newsprint.accent,
      fontFamily: newsprint.mono,
      fontWeight: 700,
      letterSpacing: '0.2em',
      opacity: 0.82,
      padding: '14px 22px 10px',
      textAlign: 'center',
      textTransform: 'uppercase',
      transform: 'rotate(-8deg)',
      zIndex: 90,
      ...css,
    }}
  >
    <div style={{fontSize: 54, lineHeight: 0.95}}>FPO</div>
    <div style={{fontSize: 17, marginTop: 6}}>Placeholder</div>
  </div>
);

const NewsprintRules = ({css}: {css?: CSSProperties}) => (
  <div style={{borderTop: `5px solid ${newsprint.ink}`, paddingTop: 5, ...css}}>
    <div style={{borderTop: `2px solid ${newsprint.ink}`}} />
  </div>
);

const NewsprintIntro = () => (
  <AbsoluteFill style={{fontFamily: newsprint.body, overflow: 'hidden'}}>
    <Texture style="newsprint" />
    <div style={{position: 'absolute', left: 120, right: 120, top: 96}}>
      <NewsprintRules />
      <div
        style={{
          color: newsprint.accent,
          fontFamily: newsprint.mono,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.26em',
          marginTop: 26,
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        SPH Staff Awards — Innovation Award
      </div>
      <div
        style={{
          color: newsprint.ink,
          fontFamily: newsprint.headline,
          fontSize: 148,
          fontWeight: 900,
          letterSpacing: '-0.045em',
          lineHeight: 0.94,
          marginTop: 34,
          textAlign: 'center',
        }}
      >
        Newsroom AI Tools
      </div>
      <div
        style={{
          color: newsprint.ink,
          fontFamily: newsprint.mono,
          fontSize: 21,
          letterSpacing: '0.2em',
          margin: '38px 0 26px',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        The Business Times • Singapore • 2026 Edition
      </div>
      <NewsprintRules />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 92,
        color: newsprint.quiet,
        fontFamily: newsprint.body,
        fontSize: 30,
        fontStyle: 'italic',
        textAlign: 'center',
      }}
    >
      “Every day, the news changes. Somehow, the chores don’t.”
    </div>
  </AbsoluteFill>
);

const NewsprintPlaceholderChrome = () => (
  <AbsoluteFill style={{pointerEvents: 'none', zIndex: 80}}>
    <CropMarks />
    <div
      style={{
        position: 'absolute',
        left: 66,
        top: 52,
        background: newsprint.ink,
        color: newsprint.paper,
        fontFamily: newsprint.mono,
        fontSize: 19,
        fontWeight: 700,
        letterSpacing: '0.16em',
        padding: '10px 15px 8px',
        textTransform: 'uppercase',
      }}
    >
      SCENE 03 / MARKET CLOSE
    </div>
    <FpoStamp css={{right: 96, top: 92}} />
    <div
      style={{
        position: 'absolute',
        left: 110,
        right: 110,
        bottom: 66,
        background: newsprint.paper,
        borderBottom: `2px solid ${newsprint.ink}`,
        borderTop: `5px solid ${newsprint.ink}`,
        boxShadow: `0 18px 40px ${newsprint.shadow}`,
        color: newsprint.ink,
        fontFamily: newsprint.headline,
        fontSize: 44,
        fontStyle: 'italic',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.08,
        padding: '22px 34px 20px',
        textAlign: 'center',
      }}
    >
      {SCENE_03_LINE}
    </div>
  </AbsoluteFill>
);

const NewsprintPlaceholder = () => (
  <AbsoluteFill style={{background: newsprint.background, overflow: 'hidden'}}>
    <Texture style="newsprint" />
    <Sequence from={-60} durationInFrames={260}>
      <RoutineScene style="newsprint" duration={200} />
    </Sequence>
    <NewsprintPlaceholderChrome />
  </AbsoluteFill>
);

const NewsprintScene06 = () => (
  <AbsoluteFill style={{background: newsprint.ink, overflow: 'hidden'}}>
    <Scene06Frame filter="saturate(.9) contrast(1.05)" />
    <div
      style={{
        position: 'absolute',
        left: 66,
        top: 52,
        background: newsprint.paper,
        color: newsprint.ink,
        fontFamily: newsprint.mono,
        fontSize: 19,
        fontWeight: 700,
        letterSpacing: '0.16em',
        padding: '10px 15px 8px',
        textTransform: 'uppercase',
      }}
    >
      SCENE 06 • NATIVE DIALOGUE
    </div>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(17, 17, 15, 0.92)',
        borderTop: `6px solid ${newsprint.accent}`,
        color: newsprint.paper,
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '30px 66px 32px',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          background: newsprint.accent,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontFamily: newsprint.headline,
          fontSize: 38,
          fontStyle: 'italic',
          letterSpacing: '-0.015em',
          lineHeight: 1.14,
        }}
      >
        {SCENE_06_LINE}
      </div>
    </div>
  </AbsoluteFill>
);

const NewsprintCredits = () => (
  <AbsoluteFill style={{fontFamily: newsprint.body, overflow: 'hidden'}}>
    <Texture style="newsprint" />
    <div style={{position: 'absolute', left: 210, right: 210, top: 86}}>
      <NewsprintRules />
      <div
        style={{
          color: newsprint.accent,
          fontFamily: newsprint.mono,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '0.26em',
          margin: '24px 0 10px',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        Production Credits
      </div>
      <div
        style={{
          color: newsprint.ink,
          fontFamily: newsprint.headline,
          fontSize: 62,
          fontWeight: 900,
          letterSpacing: '-0.035em',
          textAlign: 'center',
        }}
      >
        The team behind BT / Newsroom AI Tools
      </div>
      <div
        style={{
          borderTop: `2px solid ${newsprint.ink}`,
          columnGap: 90,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          margin: '30px auto 0',
          paddingTop: 28,
          width: 1100,
        }}
      >
        {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
          <div key={i} style={{display: 'grid', gap: 16}}>
            {column.map((name) => (
              <div
                key={name}
                style={{
                  borderBottom: `1px dotted ${newsprint.quiet}`,
                  color: newsprint.ink,
                  fontSize: 29,
                  paddingBottom: 8,
                  textAlign: 'center',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          color: newsprint.ink,
          fontSize: 26,
          fontStyle: 'italic',
          margin: '34px 0 24px',
          textAlign: 'center',
        }}
      >
        Video made with Codex and Seedance
      </div>
      <NewsprintRules />
    </div>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Variant C — Broadcast Slate (minimal production slate)              */
/* ------------------------------------------------------------------ */

const SlateGrid = () => (
  <AbsoluteFill
    style={{
      background: `repeating-linear-gradient(0deg, ${SLATE.line} 0px, ${SLATE.line} 1px, transparent 1px, transparent 108px), repeating-linear-gradient(90deg, ${SLATE.line} 0px, ${SLATE.line} 1px, transparent 1px, transparent 108px)`,
      opacity: 0.4,
    }}
  />
);

const SlateBrackets = () => {
  const line = `3px solid ${SLATE.quiet}`;
  const corner = (css: CSSProperties, borders: CSSProperties) => (
    <div style={{position: 'absolute', width: 38, height: 38, ...borders, ...css}} />
  );
  return (
    <>
      {corner({left: 48, top: 48}, {borderLeft: line, borderTop: line})}
      {corner({right: 48, top: 48}, {borderRight: line, borderTop: line})}
      {corner({left: 48, bottom: 48}, {borderLeft: line, borderBottom: line})}
      {corner({right: 48, bottom: 48}, {borderRight: line, borderBottom: line})}
    </>
  );
};

const SlateSlug = ({children, css}: {children: ReactNode; css?: CSSProperties}) => (
  <div
    style={{
      color: SLATE.quiet,
      fontFamily: SLATE.mono,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      ...css,
    }}
  >
    {children}
  </div>
);

const SlateIntro = () => (
  <AbsoluteFill style={{background: SLATE.background, overflow: 'hidden'}}>
    <SlateGrid />
    <SlateBrackets />
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          color: SLATE.accent,
          fontFamily: SLATE.mono,
          fontSize: 23,
          fontWeight: 700,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
        }}
      >
        SPH Staff Awards / Innovation Award
      </div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 46,
          marginTop: 46,
        }}
      >
        <div style={{width: 130, height: 2, background: SLATE.quiet}} />
        <div
          style={{
            color: SLATE.ink,
            fontFamily: SLATE.headline,
            fontSize: 108,
            fontWeight: 900,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Newsroom AI Tools
        </div>
        <div style={{width: 130, height: 2, background: SLATE.quiet}} />
      </div>
      <div
        style={{
          color: SLATE.quiet,
          fontFamily: SLATE.mono,
          fontSize: 21,
          letterSpacing: '0.3em',
          marginTop: 44,
          textTransform: 'uppercase',
        }}
      >
        BT / The Business Times
      </div>
    </AbsoluteFill>
    <SlateSlug css={{position: 'absolute', right: 106, bottom: 58}}>
      TC 00:00:00:00
    </SlateSlug>
  </AbsoluteFill>
);

const SlatePlaceholder = () => (
  <AbsoluteFill style={{background: SLATE.background, overflow: 'hidden'}}>
    <SlateGrid />
    <div
      style={{
        position: 'absolute',
        inset: 92,
        border: `2px dashed rgba(244, 242, 236, 0.28)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        right: 60,
        top: -60,
        color: 'transparent',
        fontFamily: SLATE.headline,
        fontSize: 640,
        fontWeight: 900,
        letterSpacing: '-0.05em',
        lineHeight: 1,
        WebkitTextStroke: `3px rgba(244, 242, 236, 0.3)`,
      }}
    >
      03
    </div>
    <div
      style={{
        position: 'absolute',
        left: 132,
        top: 132,
        background: SLATE.accent,
        color: SLATE.background,
        fontFamily: SLATE.mono,
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.2em',
        padding: '11px 16px 9px',
        textTransform: 'uppercase',
      }}
    >
      Placeholder
    </div>
    <SlateSlug css={{position: 'absolute', left: 132, bottom: 318}}>
      S03 / Market close / Final footage to follow
    </SlateSlug>
    <div
      style={{
        position: 'absolute',
        left: 132,
        bottom: 150,
        borderLeft: `10px solid ${SLATE.accent}`,
        color: SLATE.ink,
        fontFamily: SLATE.sans,
        fontSize: 62,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1.08,
        maxWidth: 1150,
        paddingLeft: 36,
      }}
    >
      {SCENE_03_LINE}
    </div>
  </AbsoluteFill>
);

const SlateScene06 = () => (
  <AbsoluteFill style={{background: SLATE.background, overflow: 'hidden'}}>
    <Scene06Frame filter="saturate(.92) contrast(1.03)" />
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(0deg, rgba(14,15,18,.82) 0%, rgba(14,15,18,.18) 30%, rgba(14,15,18,0) 48%)',
      }}
    />
    <SlateBrackets />
    <SlateSlug css={{position: 'absolute', left: 106, top: 58, color: SLATE.ink}}>
      S06 / Native dialogue / Seedance
    </SlateSlug>
    <div
      style={{
        position: 'absolute',
        left: 106,
        bottom: 96,
        borderLeft: `10px solid ${SLATE.accent}`,
        color: SLATE.ink,
        fontFamily: SLATE.sans,
        fontSize: 46,
        fontWeight: 800,
        letterSpacing: '-0.015em',
        lineHeight: 1.14,
        maxWidth: 1400,
        paddingLeft: 34,
        textShadow: '0 4px 24px rgba(0,0,0,.5)',
      }}
    >
      {SCENE_06_LINE}
    </div>
  </AbsoluteFill>
);

const SlateCredits = () => (
  <AbsoluteFill style={{background: SLATE.background, overflow: 'hidden'}}>
    <SlateGrid />
    <SlateBrackets />
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          color: SLATE.accent,
          fontFamily: SLATE.mono,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
        }}
      >
        Credits
      </div>
      <div
        style={{
          color: SLATE.quiet,
          fontFamily: SLATE.mono,
          fontSize: 19,
          letterSpacing: '0.24em',
          marginTop: 18,
          textTransform: 'uppercase',
        }}
      >
        The team behind BT / Newsroom AI Tools
      </div>
      <div
        style={{
          columnGap: 120,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          marginTop: 52,
          rowGap: 0,
        }}
      >
        {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
          <div key={i} style={{display: 'grid', gap: 21}}>
            {column.map((name) => (
              <div
                key={name}
                style={{
                  color: SLATE.ink,
                  fontFamily: SLATE.sans,
                  fontSize: 31,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{width: 320, height: 2, background: SLATE.line, marginTop: 54}} />
      <div
        style={{
          color: SLATE.quiet,
          fontFamily: SLATE.mono,
          fontSize: 20,
          letterSpacing: '0.26em',
          marginTop: 34,
          textTransform: 'uppercase',
        }}
      >
        Video made with Codex and Seedance
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Variant D — Wire Terminal (the machine's-eye view)                  */
/* ------------------------------------------------------------------ */

const WIRE = {
  bg: '#04090a',
  panel: '#081113',
  green: '#3dffa0',
  greenDim: 'rgba(61, 255, 160, 0.5)',
  amber: '#ffb340',
  white: '#e8f5ee',
  quiet: 'rgba(232, 245, 238, 0.45)',
  line: 'rgba(61, 255, 160, 0.22)',
  mono: '"Courier New", Courier, monospace',
};

const WireScanlines = () => (
  <AbsoluteFill
    style={{
      background:
        'repeating-linear-gradient(0deg, rgba(61,255,160,0.045) 0px, rgba(61,255,160,0.045) 1px, transparent 1px, transparent 4px)',
      pointerEvents: 'none',
    }}
  />
);

const WireTicker = ({css}: {css?: CSSProperties}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      background: WIRE.panel,
      borderTop: `2px solid ${WIRE.line}`,
      color: WIRE.amber,
      fontFamily: WIRE.mono,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '0.1em',
      overflow: 'hidden',
      padding: '16px 40px 14px',
      whiteSpace: 'nowrap',
      ...css,
    }}
  >
    STI 3,412.18 <span style={{color: WIRE.green}}>▲ 0.6%</span>
    {'   ·   '}S&P 500 5,881.02 <span style={{color: WIRE.green}}>▲ 0.3%</span>
    {'   ·   '}CPI 2.1%{'   ·   '}EARNINGS: 14 FILINGS TODAY{'   ·   '}SGX CLOSE
    17:04 SGT{'   ·   '}DAILY SUMMARY: <span style={{color: WIRE.green}}>READY</span>
  </div>
);

const WireLog = ({lines, css}: {lines: string[]; css?: CSSProperties}) => (
  <div
    style={{
      color: WIRE.greenDim,
      display: 'grid',
      fontFamily: WIRE.mono,
      fontSize: 22,
      fontWeight: 700,
      gap: 10,
      letterSpacing: '0.04em',
      ...css,
    }}
  >
    {lines.map((line) => (
      <div key={line}>{line}</div>
    ))}
  </div>
);

const WireIntro = () => (
  <AbsoluteFill style={{background: WIRE.bg, overflow: 'hidden'}}>
    <WireScanlines />
    <div
      style={{
        position: 'absolute',
        right: 88,
        top: 62,
        color: WIRE.amber,
        fontFamily: WIRE.mono,
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.22em',
      }}
    >
      SPH STAFF AWARDS // INNOVATION AWARD
    </div>
    <WireLog
      lines={[
        '> sgx.market_close detected · 17:04:12 SGT',
        '> summary.draft generated in 4.2s',
        '> charts.render (print + digital) … ok',
        '> handoff → journalist review',
      ]}
      css={{position: 'absolute', left: 88, top: 62}}
    />
    <div
      style={{
        position: 'absolute',
        left: 88,
        top: 380,
        color: WIRE.green,
        fontFamily: WIRE.mono,
        fontSize: 120,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.02,
        textShadow: `0 0 34px rgba(61, 255, 160, 0.45)`,
      }}
    >
      $ NEWSROOM
      <br />
      &nbsp;&nbsp;AI_TOOLS
      <span
        style={{
          background: WIRE.green,
          boxShadow: `0 0 26px rgba(61,255,160,.8)`,
          display: 'inline-block',
          height: 96,
          marginLeft: 30,
          width: 52,
        }}
      />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 92,
        bottom: 120,
        color: WIRE.white,
        fontFamily: WIRE.mono,
        fontSize: 25,
        fontWeight: 700,
        letterSpacing: '0.14em',
      }}
    >
      BT / THE BUSINESS TIMES · STORY ENGINE ONLINE
    </div>
    <WireTicker />
  </AbsoluteFill>
);

const WireProgressBar = ({filled, total}: {filled: number; total: number}) => (
  <div style={{display: 'flex', gap: 7}}>
    {Array.from({length: total}, (_, i) => (
      <div
        key={i}
        style={{
          background: i < filled ? WIRE.green : 'transparent',
          border: `2px solid ${i < filled ? WIRE.green : WIRE.line}`,
          height: 26,
          width: 30,
        }}
      />
    ))}
  </div>
);

const WirePlaceholder = () => (
  <AbsoluteFill style={{background: WIRE.bg, overflow: 'hidden'}}>
    <WireScanlines />
    <div
      style={{
        position: 'absolute',
        inset: 76,
        border: `2px solid ${WIRE.line}`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 132,
        top: 132,
        color: WIRE.amber,
        fontFamily: WIRE.mono,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: '0.16em',
      }}
    >
      [ S03 · MARKET CLOSE ]
    </div>
    <div style={{position: 'absolute', left: 132, top: 210}}>
      <div
        style={{
          color: WIRE.quiet,
          fontFamily: WIRE.mono,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '0.14em',
          marginBottom: 16,
        }}
      >
        STATUS: AWAITING FINAL FOOTAGE
      </div>
      <WireProgressBar filled={13} total={21} />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 132,
        bottom: 330,
        color: WIRE.white,
        fontFamily: WIRE.mono,
        fontSize: 52,
        fontWeight: 700,
        lineHeight: 1.16,
        maxWidth: 1500,
        textShadow: '0 0 24px rgba(232,245,238,.25)',
      }}
    >
      <span style={{color: WIRE.green}}>VO ▸</span> “When the market closes,
      the routine begins.”
    </div>
    <WireLog
      lines={[
        '> scene_03.mp4 — pending upload',
        '> placeholder.render … ok',
      ]}
      css={{position: 'absolute', left: 132, bottom: 170}}
    />
    <WireTicker />
  </AbsoluteFill>
);

const WireScene06 = () => (
  <AbsoluteFill style={{background: WIRE.bg, overflow: 'hidden'}}>
    <Scene06Frame filter="saturate(.95) contrast(1.05)" />
    <div
      style={{
        position: 'absolute',
        inset: 34,
        border: `2px solid rgba(61, 255, 160, 0.55)`,
        boxShadow: 'inset 0 0 60px rgba(4,9,10,.35)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: 66,
        alignItems: 'center',
        background: 'rgba(4, 9, 10, 0.82)',
        border: `2px solid ${WIRE.line}`,
        color: WIRE.white,
        display: 'flex',
        fontFamily: WIRE.mono,
        fontSize: 21,
        fontWeight: 700,
        gap: 14,
        letterSpacing: '0.16em',
        padding: '12px 18px 10px',
      }}
    >
      <span
        style={{
          background: '#ff4545',
          borderRadius: '50%',
          boxShadow: '0 0 14px rgba(255,69,69,.9)',
          display: 'inline-block',
          height: 16,
          width: 16,
        }}
      />
      S06 · NATIVE DIALOGUE · SEEDANCE
    </div>
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        bottom: 66,
        background: 'rgba(4, 9, 10, 0.88)',
        borderLeft: `8px solid ${WIRE.green}`,
        color: WIRE.white,
        fontFamily: WIRE.mono,
        fontSize: 34,
        fontWeight: 700,
        lineHeight: 1.24,
        padding: '24px 32px 22px',
      }}
    >
      <span style={{color: WIRE.green, letterSpacing: '0.12em'}}>
        LIVE TRANSCRIPT ▸
      </span>{' '}
      “{SCENE_06_LINE}”
      <span
        style={{
          color: WIRE.quiet,
          float: 'right',
          fontSize: 21,
          marginTop: 12,
        }}
      >
        00:26:44
      </span>
    </div>
  </AbsoluteFill>
);

const WireCredits = () => (
  <AbsoluteFill style={{background: WIRE.bg, overflow: 'hidden'}}>
    <WireScanlines />
    <div style={{position: 'absolute', left: 132, top: 96}}>
      <div
        style={{
          color: WIRE.amber,
          fontFamily: WIRE.mono,
          fontSize: 27,
          fontWeight: 700,
          letterSpacing: '0.12em',
        }}
      >
        $ credits --team newsroom-ai-tools
      </div>
      <div
        style={{
          color: WIRE.quiet,
          fontFamily: WIRE.mono,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '0.1em',
          marginTop: 16,
        }}
      >
        11 CONTRIBUTORS · BT / THE BUSINESS TIMES
      </div>
      <div
        style={{
          columnGap: 130,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          marginTop: 56,
        }}
      >
        {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
          <div key={i} style={{display: 'grid', gap: 24}}>
            {column.map((name) => (
              <div
                key={name}
                style={{
                  color: WIRE.green,
                  fontFamily: WIRE.mono,
                  fontSize: 33,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textShadow: '0 0 18px rgba(61,255,160,.3)',
                }}
              >
                <span style={{color: WIRE.quiet}}>ok&nbsp;&nbsp;</span>
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          color: WIRE.quiet,
          fontFamily: WIRE.mono,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.1em',
          marginTop: 60,
        }}
      >
        made with codex + seedance · exit 0
      </div>
    </div>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Variant E — Product Keynote (light, launch-film language)           */
/* ------------------------------------------------------------------ */

const KEYNOTE = {
  bg: '#f6f7f9',
  ink: '#171a20',
  sub: '#6b7180',
  card: '#ffffff',
  hairline: '#e3e6ec',
  gradient: 'linear-gradient(94deg, #4f5dff 0%, #00b8d9 100%)',
  shadow: '0 40px 90px rgba(23, 26, 32, 0.14)',
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

const KeynoteGround = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(900px 600px at 18% 8%, rgba(79, 93, 255, 0.09), transparent 60%), radial-gradient(900px 620px at 85% 92%, rgba(0, 184, 217, 0.1), transparent 60%), ${KEYNOTE.bg}`,
    }}
  />
);

const KeynotePill = ({children, css}: {children: ReactNode; css?: CSSProperties}) => (
  <div
    style={{
      background: KEYNOTE.card,
      border: `1px solid ${KEYNOTE.hairline}`,
      borderRadius: 999,
      boxShadow: '0 8px 24px rgba(23,26,32,.06)',
      color: KEYNOTE.sub,
      display: 'inline-block',
      fontFamily: KEYNOTE.sans,
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: '0.14em',
      padding: '13px 26px 11px',
      textTransform: 'uppercase',
      ...css,
    }}
  >
    {children}
  </div>
);

const KeynoteGradientWord = ({children}: {children: ReactNode}) => (
  <span
    style={{
      backgroundImage: KEYNOTE.gradient,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    }}
  >
    {children}
  </span>
);

const KeynoteIntro = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <KeynoteGround />
    <div
      style={{
        position: 'absolute',
        left: 210,
        top: 210,
        width: 480,
        height: 300,
        background: KEYNOTE.card,
        border: `1px solid ${KEYNOTE.hairline}`,
        borderRadius: 24,
        boxShadow: KEYNOTE.shadow,
        opacity: 0.55,
        padding: 30,
        transform: 'rotate(-7deg)',
      }}
    >
      <div style={{background: '#eef0f4', borderRadius: 8, height: 18, width: 200}} />
      <svg width="410" height="180" viewBox="0 0 410 180" style={{marginTop: 28}}>
        <path
          d="M 8 150 C 60 140, 90 152, 130 122 S 200 96, 240 108 S 320 46, 402 24"
          fill="none"
          stroke="#4f5dff"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    </div>
    <div
      style={{
        position: 'absolute',
        right: 190,
        bottom: 190,
        width: 430,
        height: 260,
        background: KEYNOTE.card,
        border: `1px solid ${KEYNOTE.hairline}`,
        borderRadius: 24,
        boxShadow: KEYNOTE.shadow,
        display: 'grid',
        gap: 20,
        opacity: 0.55,
        padding: 34,
        transform: 'rotate(6deg)',
      }}
    >
      {[340, 360, 300, 210].map((w, i) => (
        <div key={i} style={{background: '#eef0f4', borderRadius: 8, height: 20, width: w}} />
      ))}
    </div>
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <KeynotePill>SPH Staff Awards · Innovation Award</KeynotePill>
      <div
        style={{
          color: KEYNOTE.ink,
          fontFamily: KEYNOTE.sans,
          fontSize: 128,
          fontWeight: 800,
          letterSpacing: '-0.045em',
          lineHeight: 1.02,
          marginTop: 44,
          textAlign: 'center',
        }}
      >
        Newsroom <KeynoteGradientWord>AI</KeynoteGradientWord> Tools.
      </div>
      <div
        style={{
          color: KEYNOTE.sub,
          fontFamily: KEYNOTE.sans,
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          marginTop: 30,
        }}
      >
        Less grunt work. More journalism.
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

const KeynotePlaceholder = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <KeynoteGround />
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: KEYNOTE.card,
          border: `1px solid ${KEYNOTE.hairline}`,
          borderRadius: 32,
          boxShadow: KEYNOTE.shadow,
          padding: '56px 72px 52px',
          textAlign: 'center',
          width: 1160,
        }}
      >
        <KeynotePill>Scene 03 · Market close</KeynotePill>
        <div
          style={{
            color: KEYNOTE.ink,
            fontFamily: KEYNOTE.sans,
            fontSize: 58,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.12,
            margin: '38px auto 0',
            maxWidth: 900,
          }}
        >
          {SCENE_03_LINE}
        </div>
        <div
          style={{
            border: `2px dashed ${KEYNOTE.hairline}`,
            borderRadius: 18,
            color: KEYNOTE.sub,
            fontFamily: KEYNOTE.sans,
            fontSize: 23,
            fontWeight: 600,
            letterSpacing: '0.08em',
            margin: '44px auto 0',
            padding: '20px 30px 18px',
            textTransform: 'uppercase',
            width: 640,
          }}
        >
          Placeholder — final footage in production
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            marginTop: 40,
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              style={{
                background: i < 3 ? '#4f5dff' : KEYNOTE.hairline,
                borderRadius: 999,
                height: 10,
                width: i === 2 ? 44 : 10,
              }}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

const KeynoteScene06 = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <KeynoteGround />
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 64,
        transform: 'translateX(-50%)',
        width: 1360,
        background: KEYNOTE.card,
        border: `1px solid ${KEYNOTE.hairline}`,
        borderRadius: 26,
        boxShadow: KEYNOTE.shadow,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${KEYNOTE.hairline}`,
          display: 'flex',
          gap: 10,
          padding: '16px 24px',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{background: c, borderRadius: '50%', height: 15, width: 15}} />
        ))}
        <div
          style={{
            color: KEYNOTE.sub,
            fontFamily: KEYNOTE.sans,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: '0.1em',
            marginLeft: 16,
            textTransform: 'uppercase',
          }}
        >
          S06 · Live footage · Native VO
        </div>
      </div>
      <div style={{height: 700, position: 'relative'}}>
        <Scene06Frame filter="saturate(.98)" />
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 74,
        transform: 'translateX(-50%)',
        color: KEYNOTE.ink,
        fontFamily: KEYNOTE.sans,
        fontSize: 40,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
        maxWidth: 1280,
        textAlign: 'center',
        width: 1280,
      }}
    >
      {SCENE_06_LINE}
      <div
        style={{
          backgroundImage: KEYNOTE.gradient,
          borderRadius: 999,
          height: 6,
          margin: '26px auto 0',
          width: 200,
        }}
      />
    </div>
  </AbsoluteFill>
);

const KeynoteCredits = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <KeynoteGround />
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <KeynotePill>Credits</KeynotePill>
      <div
        style={{
          color: KEYNOTE.ink,
          fontFamily: KEYNOTE.sans,
          fontSize: 54,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginTop: 34,
        }}
      >
        The team behind BT · Newsroom AI Tools
      </div>
      <div
        style={{
          backgroundImage: KEYNOTE.gradient,
          borderRadius: 999,
          height: 5,
          marginTop: 30,
          width: 160,
        }}
      />
      <div
        style={{
          columnGap: 140,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          marginTop: 52,
        }}
      >
        {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
          <div key={i} style={{display: 'grid', gap: 22}}>
            {column.map((name) => (
              <div
                key={name}
                style={{
                  color: KEYNOTE.ink,
                  fontFamily: KEYNOTE.sans,
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  textAlign: 'center',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
      <KeynotePill css={{marginTop: 56}}>
        Video made with Codex and Seedance
      </KeynotePill>
    </AbsoluteFill>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Variant F — Redline Edit (editor's markup, human in the loop)       */
/* ------------------------------------------------------------------ */

const REDLINE = {
  paper: '#f9f4ea',
  rule: 'rgba(32, 29, 24, 0.09)',
  ink: '#201d18',
  red: '#d92f1e',
  blue: '#2a52c9',
  highlight: '#ffe25a',
  type: '"Courier New", Courier, monospace',
};

const RedlineGround = () => (
  <AbsoluteFill
    style={{
      background: `repeating-linear-gradient(0deg, transparent 0px, transparent 53px, ${REDLINE.rule} 53px, ${REDLINE.rule} 55px), ${REDLINE.paper}`,
    }}
  />
);

const RedlineStamp = ({
  children,
  css,
}: {
  children: ReactNode;
  css?: CSSProperties;
}) => (
  <div
    style={{
      position: 'absolute',
      border: `5px solid ${REDLINE.red}`,
      borderRadius: 14,
      color: REDLINE.red,
      fontFamily: REDLINE.type,
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: '0.14em',
      opacity: 0.85,
      padding: '16px 26px 12px',
      textTransform: 'uppercase',
      transform: 'rotate(-7deg)',
      ...css,
    }}
  >
    {children}
  </div>
);

const RedlineIntro = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <RedlineGround />
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 118,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.1em',
      }}
    >
      SPH STAFF AWARDS — INNOVATION AWARD ENTRY, DRAFT 03
    </div>
    <div style={{position: 'absolute', left: 150, top: 300}}>
      <div
        style={{
          color: REDLINE.ink,
          fontFamily: REDLINE.type,
          fontSize: 108,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.08,
        }}
      >
        Newsroom{' '}
        <span style={{position: 'relative', whiteSpace: 'nowrap'}}>
          AI Tools
          <span
            style={{
              position: 'absolute',
              inset: '-26px -40px -18px -34px',
              border: `6px solid ${REDLINE.red}`,
              borderRadius: '50%',
              transform: 'rotate(-3deg)',
            }}
          />
        </span>
      </div>
      <div
        style={{
          color: REDLINE.ink,
          fontFamily: REDLINE.type,
          fontSize: 44,
          fontWeight: 700,
          marginTop: 84,
        }}
      >
        the{' '}
        <span
          style={{
            color: REDLINE.red,
            textDecorationColor: REDLINE.red,
            textDecorationLine: 'line-through',
            textDecorationThickness: 5,
          }}
        >
          <span style={{color: REDLINE.ink}}>daily grunt work</span>
        </span>{' '}
        <span style={{color: REDLINE.blue, position: 'relative'}}>
          work that matters
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -40,
              color: REDLINE.blue,
              fontSize: 46,
              transform: 'translateX(-50%)',
            }}
          >
            ^
          </span>
        </span>
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        right: 210,
        top: 250,
        color: REDLINE.red,
        fontFamily: REDLINE.type,
        fontSize: 27,
        fontStyle: 'italic',
        fontWeight: 700,
        transform: 'rotate(4deg)',
        width: 300,
      }}
    >
      this is our story ✓
    </div>
    <div
      style={{
        position: 'absolute',
        left: 150,
        bottom: 96,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 23,
        fontWeight: 700,
        letterSpacing: '0.1em',
        opacity: 0.65,
      }}
    >
      BT / THE BUSINESS TIMES
    </div>
  </AbsoluteFill>
);

const RedlinePlaceholder = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <RedlineGround />
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 112,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 25,
        fontWeight: 700,
        letterSpacing: '0.1em',
      }}
    >
      [SCENE 03 — MARKET CLOSE]
    </div>
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 216,
        color: REDLINE.ink,
        display: 'flex',
        fontFamily: REDLINE.type,
        fontSize: 56,
        fontWeight: 700,
        gap: 44,
      }}
    >
      {['OPEN.', 'FIND.', 'COPY.', 'PASTE.'].map((word) => (
        <span
          key={word}
          style={{
            textDecorationColor: REDLINE.red,
            textDecorationLine: 'line-through',
            textDecorationThickness: 6,
          }}
        >
          {word}
        </span>
      ))}
      <span style={{color: REDLINE.blue}}>→ ONE CLICK.</span>
    </div>
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 430,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 62,
        fontWeight: 700,
        lineHeight: 1.3,
        maxWidth: 1480,
        textDecorationColor: REDLINE.red,
        textDecorationLine: 'underline',
        textDecorationStyle: 'wavy',
        textDecorationThickness: 4,
        textUnderlineOffset: 14,
      }}
    >
      {SCENE_03_LINE}
    </div>
    <div
      style={{
        position: 'absolute',
        left: 150,
        bottom: 150,
        background: REDLINE.highlight,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding: '14px 26px 10px',
        transform: 'rotate(-1.2deg)',
      }}
    >
      PLACEHOLDER — FOOTAGE TO COME
    </div>
    <RedlineStamp css={{right: 170, top: 130}}>Not final</RedlineStamp>
  </AbsoluteFill>
);

const RedlineScene06 = () => (
  <AbsoluteFill style={{background: REDLINE.ink, overflow: 'hidden'}}>
    <Scene06Frame filter="saturate(.94) contrast(1.04)" />
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(0deg, rgba(32,29,24,.78) 0%, rgba(32,29,24,.14) 32%, rgba(32,29,24,0) 50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 84,
        top: 66,
        background: REDLINE.paper,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 23,
        fontWeight: 700,
        letterSpacing: '0.1em',
        padding: '12px 18px 10px',
        transform: 'rotate(-1deg)',
      }}
    >
      S06 — KEEP AS IS <span style={{color: REDLINE.red}}>✓</span>
    </div>
    <RedlineStamp css={{right: 96, top: 92, borderRadius: '50%', padding: '30px 34px 26px', textAlign: 'center', fontSize: 25}}>
      HUMAN
      <br />
      IN THE LOOP
    </RedlineStamp>
    <div
      style={{
        position: 'absolute',
        left: 84,
        bottom: 92,
        color: REDLINE.paper,
        fontFamily: REDLINE.type,
        fontSize: 46,
        fontWeight: 700,
        lineHeight: 1.24,
        maxWidth: 1500,
        textShadow: '0 4px 22px rgba(0,0,0,.55)',
      }}
    >
      {SCENE_06_LINE}
      <div
        style={{
          background: REDLINE.red,
          borderRadius: 3,
          height: 7,
          marginTop: 20,
          transform: 'rotate(-0.4deg)',
          width: 620,
        }}
      />
    </div>
  </AbsoluteFill>
);

const RedlineCredits = () => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <RedlineGround />
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 104,
        color: REDLINE.ink,
        fontFamily: REDLINE.type,
        fontSize: 44,
        fontWeight: 700,
      }}
    >
      CREDITS — the team behind BT / Newsroom AI Tools
    </div>
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 240,
        columnGap: 150,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
      }}
    >
      {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, i) => (
        <div key={i} style={{display: 'grid', gap: 26}}>
          {column.map((name) => (
            <div
              key={name}
              style={{
                color: REDLINE.ink,
                fontFamily: REDLINE.type,
                fontSize: 37,
                fontWeight: 700,
              }}
            >
              <span style={{color: REDLINE.red, marginRight: 22}}>✓</span>
              {name}
            </div>
          ))}
        </div>
      ))}
    </div>
    <RedlineStamp css={{right: 170, bottom: 150, transform: 'rotate(-9deg)'}}>
      Approved for press
    </RedlineStamp>
    <div
      style={{
        position: 'absolute',
        left: 150,
        bottom: 100,
        color: REDLINE.blue,
        fontFamily: REDLINE.type,
        fontSize: 27,
        fontStyle: 'italic',
        fontWeight: 700,
      }}
    >
      Video made with Codex and Seedance
    </div>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Preview grid                                                        */
/* ------------------------------------------------------------------ */

const VARIANT_PANELS: Record<
  StyleboardVariant,
  {title: string; panels: Array<{label: string; node: ReactNode}>}
> = {
  'paper-collage': {
    title: 'A — PAPER COLLAGE',
    panels: [
      {label: 'INTRO', node: <PaperCollageIntro />},
      {label: 'PLACEHOLDER SCENE', node: <PaperCollagePlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <PaperCollageScene06 />},
      {label: 'CREDITS', node: <PaperCollageCredits />},
    ],
  },
  'newsprint-proof': {
    title: 'B — NEWSPRINT PROOF',
    panels: [
      {label: 'INTRO', node: <NewsprintIntro />},
      {label: 'PLACEHOLDER SCENE', node: <NewsprintPlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <NewsprintScene06 />},
      {label: 'CREDITS', node: <NewsprintCredits />},
    ],
  },
  'broadcast-slate': {
    title: 'C — BROADCAST SLATE',
    panels: [
      {label: 'INTRO', node: <SlateIntro />},
      {label: 'PLACEHOLDER SCENE', node: <SlatePlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <SlateScene06 />},
      {label: 'CREDITS', node: <SlateCredits />},
    ],
  },
  'wire-terminal': {
    title: 'D — WIRE TERMINAL',
    panels: [
      {label: 'INTRO', node: <WireIntro />},
      {label: 'PLACEHOLDER SCENE', node: <WirePlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <WireScene06 />},
      {label: 'CREDITS', node: <WireCredits />},
    ],
  },
  'product-keynote': {
    title: 'E — PRODUCT KEYNOTE',
    panels: [
      {label: 'INTRO', node: <KeynoteIntro />},
      {label: 'PLACEHOLDER SCENE', node: <KeynotePlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <KeynoteScene06 />},
      {label: 'CREDITS', node: <KeynoteCredits />},
    ],
  },
  'redline-edit': {
    title: 'F — REDLINE EDIT',
    panels: [
      {label: 'INTRO', node: <RedlineIntro />},
      {label: 'PLACEHOLDER SCENE', node: <RedlinePlaceholder />},
      {label: 'SCENE 06 OVERLAY', node: <RedlineScene06 />},
      {label: 'CREDITS', node: <RedlineCredits />},
    ],
  },
};

const PANEL_WIDTH = 924;
const PANEL_SCALE = PANEL_WIDTH / 1920;
const PANEL_HEIGHT = Math.round(1080 * PANEL_SCALE);

const PreviewPanel = ({label, children}: {label: string; children: ReactNode}) => (
  <div style={{width: PANEL_WIDTH}}>
    <div
      style={{
        color: 'rgba(244, 242, 236, 0.6)',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: '0.22em',
        marginBottom: 8,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
    <div
      style={{
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        overflow: 'hidden',
        position: 'relative',
        outline: '1px solid rgba(244, 242, 236, 0.18)',
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          position: 'absolute',
          transform: `scale(${PANEL_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  </div>
);

export const StyleboardPreview = ({variant}: {variant: StyleboardVariant}) => {
  const {title, panels} = VARIANT_PANELS[variant];
  return (
    <AbsoluteFill style={{background: '#14151a', padding: '20px 24px'}}>
      <div
        style={{
          color: '#f4f2ec',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.24em',
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${PANEL_WIDTH}px ${PANEL_WIDTH}px`,
          columnGap: 24,
          rowGap: 18,
        }}
      >
        {panels.map(({label, node}) => (
          <PreviewPanel key={label} label={label}>
            {node}
          </PreviewPanel>
        ))}
      </div>
    </AbsoluteFill>
  );
};
