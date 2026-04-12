/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminShell from "../adminShell.js";
import type * as aiEngineOutputs from "../aiEngineOutputs.js";
import type * as buyerProfiles from "../buyerProfiles.js";
import type * as dealRooms from "../dealRooms.js";
import type * as engines_comps from "../engines/comps.js";
import type * as engines_cost from "../engines/cost.js";
import type * as engines_leverage from "../engines/leverage.js";
import type * as engines_offer from "../engines/offer.js";
import type * as engines_pricing from "../engines/pricing.js";
import type * as health from "../health.js";
import type * as intake from "../intake.js";
import type * as lib_engineResult from "../lib/engineResult.js";
import type * as lib_promptVersion from "../lib/promptVersion.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_validators from "../lib/validators.js";
import type * as promptRegistry from "../promptRegistry.js";
import type * as properties from "../properties.js";
import type * as propertyMerge from "../propertyMerge.js";
import type * as security_dataExport from "../security/dataExport.js";
import type * as security_dataExportAction from "../security/dataExportAction.js";
import type * as security_deletionRequest from "../security/deletionRequest.js";
import type * as security_fileAccess from "../security/fileAccess.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminShell: typeof adminShell;
  aiEngineOutputs: typeof aiEngineOutputs;
  buyerProfiles: typeof buyerProfiles;
  dealRooms: typeof dealRooms;
  "engines/comps": typeof engines_comps;
  "engines/cost": typeof engines_cost;
  "engines/leverage": typeof engines_leverage;
  "engines/offer": typeof engines_offer;
  "engines/pricing": typeof engines_pricing;
  health: typeof health;
  intake: typeof intake;
  "lib/engineResult": typeof lib_engineResult;
  "lib/promptVersion": typeof lib_promptVersion;
  "lib/session": typeof lib_session;
  "lib/validators": typeof lib_validators;
  promptRegistry: typeof promptRegistry;
  properties: typeof properties;
  propertyMerge: typeof propertyMerge;
  "security/dataExport": typeof security_dataExport;
  "security/dataExportAction": typeof security_dataExportAction;
  "security/deletionRequest": typeof security_deletionRequest;
  "security/fileAccess": typeof security_fileAccess;
  users: typeof users;
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
