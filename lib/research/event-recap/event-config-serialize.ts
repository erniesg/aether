/**
 * Convert EventConfig <-> a JSON-safe shape suitable for Convex storage
 * (or any wire transport). RegExps are flattened to { source, flags }
 * tuples; everything else passes through structurally.
 *
 * Use this when you need to persist an EventConfig outside the
 * in-process registry (Convex tables, R2 JSON, network).
 */

import type {
  AtlasLaneConfig,
  EventConfig,
  IncidentalMentionConfig,
  PrimaryStoryOverride,
  RecapMode,
  StoryDefinitionConfig,
} from './event-config';
import type { EventPostStoryType } from './types';

export interface SerializedPattern {
  source: string;
  flags: string;
}

export interface SerializedSignal {
  patternSource: string;
  patternFlags: string;
  weight: number;
}

export interface SerializedStory {
  storyId: string;
  label: string;
  summary: string;
  keywords: string[];
  signals: SerializedSignal[];
  storyType?: EventPostStoryType;
}

export interface SerializedPrimaryStoryOverride {
  pattern: SerializedPattern;
  storyId: string;
  subPattern?: SerializedPattern;
  subStoryId?: string;
}

export interface SerializedCorpusPhraseRule {
  value: string;
  pattern: SerializedPattern;
}

export interface SerializedAtlasLane {
  id: string;
  label: string;
  x: number;
  matcher?: SerializedPattern;
}

export interface SerializedIncidentalMentionConfig {
  exactMentions: SerializedPattern;
  specificEventSignal: SerializedPattern;
  minLength?: number;
}

export interface SerializedEventConfig {
  eventId: string;
  name: string;
  stories: SerializedStory[];
  smallStoryMergeTargets: Record<string, string>;
  primaryStoryOverrides: SerializedPrimaryStoryOverride[];
  corpusPhraseRules: SerializedCorpusPhraseRule[];
  singleTokenEntityAllowlist: string[];
  curatedThemeCopy: Record<string, { label: string; summary: string }>;
  incidentalMentionPatterns?: SerializedIncidentalMentionConfig;
  atlasLanes: SerializedAtlasLane[];
  recapMode: RecapMode;
}

function serializePattern(pattern: RegExp): SerializedPattern {
  return { source: pattern.source, flags: pattern.flags };
}

function deserializePattern(serialized: SerializedPattern): RegExp {
  return new RegExp(serialized.source, serialized.flags);
}

export function serializeEventConfig(config: EventConfig): SerializedEventConfig {
  return {
    eventId: config.eventId,
    name: config.name,
    stories: config.stories.map(
      (s): SerializedStory => ({
        storyId: s.storyId,
        label: s.label,
        summary: s.summary,
        keywords: [...s.keywords],
        signals: s.signals.map((signal) => ({
          patternSource: signal.pattern.source,
          patternFlags: signal.pattern.flags,
          weight: signal.weight,
        })),
        storyType: s.storyType,
      })
    ),
    smallStoryMergeTargets: { ...config.smallStoryMergeTargets },
    primaryStoryOverrides: config.primaryStoryOverrides.map(
      (o): SerializedPrimaryStoryOverride => ({
        pattern: serializePattern(o.pattern),
        storyId: o.storyId,
        subPattern: o.subPattern ? serializePattern(o.subPattern) : undefined,
        subStoryId: o.subStoryId,
      })
    ),
    corpusPhraseRules: config.corpusPhraseRules.map((r) => ({
      value: r.value,
      pattern: serializePattern(r.pattern),
    })),
    singleTokenEntityAllowlist: [...config.singleTokenEntityAllowlist],
    curatedThemeCopy: { ...config.curatedThemeCopy },
    incidentalMentionPatterns: config.incidentalMentionPatterns
      ? {
          exactMentions: serializePattern(config.incidentalMentionPatterns.exactMentions),
          specificEventSignal: serializePattern(config.incidentalMentionPatterns.specificEventSignal),
          minLength: config.incidentalMentionPatterns.minLength,
        }
      : undefined,
    atlasLanes: config.atlasLanes.map(
      (lane): SerializedAtlasLane => ({
        id: lane.id,
        label: lane.label,
        x: lane.x,
        matcher: lane.matcher ? serializePattern(lane.matcher) : undefined,
      })
    ),
    recapMode: config.recapMode,
  };
}

export function deserializeEventConfig(serialized: SerializedEventConfig): EventConfig {
  return {
    eventId: serialized.eventId,
    name: serialized.name,
    stories: serialized.stories.map(
      (s): StoryDefinitionConfig => ({
        storyId: s.storyId,
        label: s.label,
        summary: s.summary,
        keywords: [...s.keywords],
        signals: s.signals.map((signal) => ({
          pattern: new RegExp(signal.patternSource, signal.patternFlags),
          weight: signal.weight,
        })),
        storyType: s.storyType,
      })
    ),
    smallStoryMergeTargets: { ...serialized.smallStoryMergeTargets },
    primaryStoryOverrides: serialized.primaryStoryOverrides.map(
      (o): PrimaryStoryOverride => ({
        pattern: deserializePattern(o.pattern),
        storyId: o.storyId,
        subPattern: o.subPattern ? deserializePattern(o.subPattern) : undefined,
        subStoryId: o.subStoryId,
      })
    ),
    corpusPhraseRules: serialized.corpusPhraseRules.map((r) => ({
      value: r.value,
      pattern: deserializePattern(r.pattern),
    })),
    singleTokenEntityAllowlist: [...serialized.singleTokenEntityAllowlist],
    curatedThemeCopy: { ...serialized.curatedThemeCopy },
    incidentalMentionPatterns: serialized.incidentalMentionPatterns
      ? ({
          exactMentions: deserializePattern(serialized.incidentalMentionPatterns.exactMentions),
          specificEventSignal: deserializePattern(serialized.incidentalMentionPatterns.specificEventSignal),
          minLength: serialized.incidentalMentionPatterns.minLength,
        } satisfies IncidentalMentionConfig)
      : undefined,
    atlasLanes: serialized.atlasLanes.map(
      (lane): AtlasLaneConfig => ({
        id: lane.id,
        label: lane.label,
        x: lane.x,
        matcher: lane.matcher ? deserializePattern(lane.matcher) : undefined,
      })
    ),
    recapMode: serialized.recapMode,
  };
}
