/**
 * Demo mode fixtures — pre-cached lap results for live-show fallback.
 *
 * When the workspace loads with ?demo=eightsleep, the right-rail renders this
 * fixture instead of waiting for a live lap. Canvas is read-only; a small
 * "demo" badge appears in the header.
 *
 * Source: docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/
 * (real run, trimmed to one variation + four format crops)
 */

import type {
  AutoModeCampaignView,
  AutoModeVariationView,
} from '@/components/rail/sections/AutoModePanel';

export interface DemoLap {
  campaign: AutoModeCampaignView;
  variations: AutoModeVariationView[];
}

export const EIGHTSLEEP_DEMO_LAP: DemoLap = {
  campaign: {
    id: 'demo-eightsleep',
    triggerKind: 'url',
    triggerPayload: 'https://www.eightsleep.com/',
    variationCount: 1,
    notifyMode: 'review',
    status: 'completed',
    startedAt: 1777202007000,
    finishedAt: 1777202100000,
  },
  variations: [
    {
      id: 'demo-eightsleep-v1',
      index: 1,
      status: 'ready',
      caption:
        'Wake up like the algorithm finally got you. Pod 4 Ultra, chrome-quiet bedroom, that soft Singapore sunrise — sleep, but make it editorial.',
      captionsByLocale: {
        'en-SG':
          'Wake up like the algorithm finally got you. Pod 4 Ultra, chrome-quiet bedroom, that soft Singapore sunrise — sleep, but make it editorial.',
        'zh-Hans-SG':
          '一觉醒来,像被算法温柔叫醒。Pod 4 Ultra、铬色静谧卧室、新加坡清晨柔光——睡眠,也能拍成大片。',
        'ms-SG':
          'Bangun macam algoritma akhirnya faham kau. Pod 4 Ultra, bilik krom yang tenang, cahaya pagi Singapura — tidur, tapi gaya editorial.',
        'ta-SG':
          'அல்காரிதம் உன்னை புரிந்துகொண்ட மாதிரி எழுந்திரு. Pod 4 Ultra, குரோம் அமைதியான படுக்கையறை, சிங்கப்பூர் காலை ஒளி — தூக்கம், ஆனால் எடிட்டோரியல் பாணியில்.',
      },
      hashtags: ['#EightSleep', '#Pod4Ultra', '#SleepTech', '#SGLifestyle', '#QuietLuxury'],
      moodNote: 'Chrome-navy serenity, cinematic dawn, ad-grade Scandi sleep editorial',
      schedulePlatform: 'instagram',
      scheduleWhenLocal: '2026-04-27T21:30:00+08:00',
      formatCrops: [
        { formatId: '1x1',  aspectRatio: '1:1',  w: 1080, h: 1080, fit: 'cover' },
        { formatId: '4x5',  aspectRatio: '4:5',  w: 1080, h: 1350, fit: 'cover' },
        { formatId: '9x16', aspectRatio: '9:16', w: 1080, h: 1920, fit: 'cover' },
        { formatId: '16x9', aspectRatio: '16:9', w: 1920, h: 1080, fit: 'cover' },
      ],
      agentRunIds: [],
      startedAt: 1777202007000,
      finishedAt: 1777202100000,
    },
  ],
};

/** Registry of known demo keys → fixture. Add more as campaigns are captured. */
export const DEMO_FIXTURES: Record<string, DemoLap> = {
  eightsleep: EIGHTSLEEP_DEMO_LAP,
};
