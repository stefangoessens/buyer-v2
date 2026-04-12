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
import type * as agentCoverage from "../agentCoverage.js";
import type * as agreements from "../agreements.js";
import type * as aiEngineOutputs from "../aiEngineOutputs.js";
import type * as availability from "../availability.js";
import type * as buyerProfiles from "../buyerProfiles.js";
import type * as buyerUpdateEvents from "../buyerUpdateEvents.js";
import type * as communicationTemplates from "../communicationTemplates.js";
import type * as dealRooms from "../dealRooms.js";
import type * as deviceTokens from "../deviceTokens.js";
import type * as engines_comps from "../engines/comps.js";
import type * as engines_cost from "../engines/cost.js";
import type * as engines_leverage from "../engines/leverage.js";
import type * as engines_offer from "../engines/offer.js";
import type * as engines_pricing from "../engines/pricing.js";
import type * as health from "../health.js";
import type * as intake from "../intake.js";
import type * as leadAttribution from "../leadAttribution.js";
import type * as ledger from "../ledger.js";
import type * as lenderCreditValidation from "../lenderCreditValidation.js";
import type * as lib_attribution from "../lib/attribution.js";
import type * as lib_buyerEvents from "../lib/buyerEvents.js";
import type * as lib_engineResult from "../lib/engineResult.js";
import type * as lib_lenderCreditValidate from "../lib/lenderCreditValidate.js";
import type * as lib_offerEligibilityCompute from "../lib/offerEligibilityCompute.js";
import type * as lib_promptVersion from "../lib/promptVersion.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_templateRender from "../lib/templateRender.js";
import type * as lib_validators from "../lib/validators.js";
import type * as messagePreferences from "../messagePreferences.js";
import type * as offerCockpit from "../offerCockpit.js";
import type * as offerEligibility from "../offerEligibility.js";
import type * as promptRegistry from "../promptRegistry.js";
import type * as properties from "../properties.js";
import type * as propertyMerge from "../propertyMerge.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reconciliation from "../reconciliation.js";
import type * as security_dataExport from "../security/dataExport.js";
import type * as security_dataExportAction from "../security/dataExportAction.js";
import type * as security_deletionRequest from "../security/deletionRequest.js";
import type * as security_fileAccess from "../security/fileAccess.js";
import type * as showingPayouts from "../showingPayouts.js";
import type * as tours from "../tours.js";
import type * as users from "../users.js";
import type * as visitorPreregistrations from "../visitorPreregistrations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminShell: typeof adminShell;
  agentCoverage: typeof agentCoverage;
  agreements: typeof agreements;
  aiEngineOutputs: typeof aiEngineOutputs;
  availability: typeof availability;
  buyerProfiles: typeof buyerProfiles;
  buyerUpdateEvents: typeof buyerUpdateEvents;
  communicationTemplates: typeof communicationTemplates;
  dealRooms: typeof dealRooms;
  deviceTokens: typeof deviceTokens;
  "engines/comps": typeof engines_comps;
  "engines/cost": typeof engines_cost;
  "engines/leverage": typeof engines_leverage;
  "engines/offer": typeof engines_offer;
  "engines/pricing": typeof engines_pricing;
  health: typeof health;
  intake: typeof intake;
  leadAttribution: typeof leadAttribution;
  ledger: typeof ledger;
  lenderCreditValidation: typeof lenderCreditValidation;
  "lib/attribution": typeof lib_attribution;
  "lib/buyerEvents": typeof lib_buyerEvents;
  "lib/engineResult": typeof lib_engineResult;
  "lib/lenderCreditValidate": typeof lib_lenderCreditValidate;
  "lib/offerEligibilityCompute": typeof lib_offerEligibilityCompute;
  "lib/promptVersion": typeof lib_promptVersion;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/scheduling": typeof lib_scheduling;
  "lib/session": typeof lib_session;
  "lib/templateRender": typeof lib_templateRender;
  "lib/validators": typeof lib_validators;
  messagePreferences: typeof messagePreferences;
  offerCockpit: typeof offerCockpit;
  offerEligibility: typeof offerEligibility;
  promptRegistry: typeof promptRegistry;
  properties: typeof properties;
  propertyMerge: typeof propertyMerge;
  rateLimits: typeof rateLimits;
  reconciliation: typeof reconciliation;
  "security/dataExport": typeof security_dataExport;
  "security/dataExportAction": typeof security_dataExportAction;
  "security/deletionRequest": typeof security_deletionRequest;
  "security/fileAccess": typeof security_fileAccess;
  showingPayouts: typeof showingPayouts;
  tours: typeof tours;
  users: typeof users;
  visitorPreregistrations: typeof visitorPreregistrations;
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
