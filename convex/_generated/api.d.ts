/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentSession from "../agentSession.js";
import type * as brandPolicy from "../brandPolicy.js";
import type * as campaigns from "../campaigns.js";
import type * as clusters from "../clusters.js";
import type * as creatorContext from "../creatorContext.js";
import type * as proposals from "../proposals.js";
import type * as providerPrefs from "../providerPrefs.js";
import type * as publisher from "../publisher.js";
import type * as runs from "../runs.js";
import type * as signals from "../signals.js";
import type * as skills from "../skills.js";
import type * as textOverlay from "../textOverlay.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentSession: typeof agentSession;
  brandPolicy: typeof brandPolicy;
  campaigns: typeof campaigns;
  clusters: typeof clusters;
  creatorContext: typeof creatorContext;
  proposals: typeof proposals;
  providerPrefs: typeof providerPrefs;
  publisher: typeof publisher;
  runs: typeof runs;
  signals: typeof signals;
  skills: typeof skills;
  textOverlay: typeof textOverlay;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
