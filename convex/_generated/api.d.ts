/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiEngineOutputs from "../aiEngineOutputs.js";
import type * as health from "../health.js";
import type * as intake from "../intake.js";
import type * as lib_engineResult from "../lib/engineResult.js";
import type * as lib_promptVersion from "../lib/promptVersion.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_validators from "../lib/validators.js";
import type * as promptRegistry from "../promptRegistry.js";
import type * as properties from "../properties.js";
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
  aiEngineOutputs: typeof aiEngineOutputs;
  health: typeof health;
  intake: typeof intake;
  "lib/engineResult": typeof lib_engineResult;
  "lib/promptVersion": typeof lib_promptVersion;
  "lib/session": typeof lib_session;
  "lib/validators": typeof lib_validators;
  promptRegistry: typeof promptRegistry;
  properties: typeof properties;
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
