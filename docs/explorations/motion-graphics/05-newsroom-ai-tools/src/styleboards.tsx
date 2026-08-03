import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Img, Sequence, staticFile} from 'remotion';
import {RoutineScene} from './scenes';
import {Tape, Texture} from './primitives';
import {THEMES} from './theme';

export type StyleboardVariant =
  | 'paper-collage'
  | 'newsprint-proof'
  | 'broadcast-slate';

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
