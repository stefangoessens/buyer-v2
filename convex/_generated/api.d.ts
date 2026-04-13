/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _diag from "../_diag.js";
import type * as addressIntake from "../addressIntake.js";
import type * as adminShell from "../adminShell.js";
import type * as agentCoverage from "../agentCoverage.js";
import type * as agreementSupersession from "../agreementSupersession.js";
import type * as agreements from "../agreements.js";
import type * as aiEngineOutputs from "../aiEngineOutputs.js";
import type * as auth from "../auth.js";
import type * as availability from "../availability.js";
import type * as buyerProfiles from "../buyerProfiles.js";
import type * as buyerUpdateEvents from "../buyerUpdateEvents.js";
import type * as closeDashboard from "../closeDashboard.js";
import type * as closeTasks from "../closeTasks.js";
import type * as communicationTemplates from "../communicationTemplates.js";
import type * as contractMilestones from "../contractMilestones.js";
import type * as contracts from "../contracts.js";
import type * as copilot from "../copilot.js";
import type * as counterOfferHistory from "../counterOfferHistory.js";
import type * as dashboard from "../dashboard.js";
import type * as dealRoomOverview from "../dealRoomOverview.js";
import type * as dealRoomRiskSummary from "../dealRoomRiskSummary.js";
import type * as dealRoomShareLinks from "../dealRoomShareLinks.js";
import type * as dealRooms from "../dealRooms.js";
import type * as deviceTokens from "../deviceTokens.js";
import type * as documentSummaries from "../documentSummaries.js";
import type * as engines_compSeeder from "../engines/compSeeder.js";
import type * as engines_compSeederMutations from "../engines/compSeederMutations.js";
import type * as engines_comps from "../engines/comps.js";
import type * as engines_compsQueries from "../engines/compsQueries.js";
import type * as engines_cost from "../engines/cost.js";
import type * as engines_insights from "../engines/insights.js";
import type * as engines_insightsMutations from "../engines/insightsMutations.js";
import type * as engines_leverage from "../engines/leverage.js";
import type * as engines_offer from "../engines/offer.js";
import type * as engines_orchestrate from "../engines/orchestrate.js";
import type * as engines_orchestrateMutations from "../engines/orchestrateMutations.js";
import type * as engines_pricing from "../engines/pricing.js";
import type * as enrichment from "../enrichment.js";
import type * as enrichmentJobs from "../enrichmentJobs.js";
import type * as externalAccess from "../externalAccess.js";
import type * as extractionMutations from "../extractionMutations.js";
import type * as extractionRunner from "../extractionRunner.js";
import type * as fileAnalysis from "../fileAnalysis.js";
import type * as fileFacts from "../fileFacts.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as intake from "../intake.js";
import type * as internalNotes from "../internalNotes.js";
import type * as kpiDashboard from "../kpiDashboard.js";
import type * as leadAttribution from "../leadAttribution.js";
import type * as ledger from "../ledger.js";
import type * as lenderCreditValidation from "../lenderCreditValidation.js";
import type * as lib_addressMatch from "../lib/addressMatch.js";
import type * as lib_assignmentRouting from "../lib/assignmentRouting.js";
import type * as lib_attribution from "../lib/attribution.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_buyerEvents from "../lib/buyerEvents.js";
import type * as lib_buyerProfile from "../lib/buyerProfile.js";
import type * as lib_closeTasks from "../lib/closeTasks.js";
import type * as lib_comparison from "../lib/comparison.js";
import type * as lib_contractProviders from "../lib/contractProviders.js";
import type * as lib_counterofferHistory from "../lib/counterofferHistory.js";
import type * as lib_dashboardDealIndex from "../lib/dashboardDealIndex.js";
import type * as lib_documentSummary from "../lib/documentSummary.js";
import type * as lib_engineResult from "../lib/engineResult.js";
import type * as lib_externalAccessSession from "../lib/externalAccessSession.js";
import type * as lib_leadAttribution from "../lib/leadAttribution.js";
import type * as lib_lenderCreditValidate from "../lib/lenderCreditValidate.js";
import type * as lib_offerEligibilityCompute from "../lib/offerEligibilityCompute.js";
import type * as lib_overview from "../lib/overview.js";
import type * as lib_promptVersion from "../lib/promptVersion.js";
import type * as lib_rateLimitBuckets from "../lib/rateLimitBuckets.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_riskSummary from "../lib/riskSummary.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_shareLink from "../lib/shareLink.js";
import type * as lib_shareLinkState from "../lib/shareLinkState.js";
import type * as lib_smsIntakeCompute from "../lib/smsIntakeCompute.js";
import type * as lib_templateRender from "../lib/templateRender.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_watchlist from "../lib/watchlist.js";
import type * as listingResponses from "../listingResponses.js";
import type * as manualOverrides from "../manualOverrides.js";
import type * as messagePreferences from "../messagePreferences.js";
import type * as negotiationBriefs from "../negotiationBriefs.js";
import type * as offerCockpit from "../offerCockpit.js";
import type * as offerEligibility from "../offerEligibility.js";
import type * as opsQueues from "../opsQueues.js";
import type * as promptRegistry from "../promptRegistry.js";
import type * as properties from "../properties.js";
import type * as propertyCases from "../propertyCases.js";
import type * as propertyComparisons from "../propertyComparisons.js";
import type * as propertyMerge from "../propertyMerge.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reconciliation from "../reconciliation.js";
import type * as releaseReadiness from "../releaseReadiness.js";
import type * as riskSummary from "../riskSummary.js";
import type * as security_dataExport from "../security/dataExport.js";
import type * as security_dataExportAction from "../security/dataExportAction.js";
import type * as security_deletionRequest from "../security/deletionRequest.js";
import type * as security_fileAccess from "../security/fileAccess.js";
import type * as settings from "../settings.js";
import type * as showingCoordination from "../showingCoordination.js";
import type * as showingPayouts from "../showingPayouts.js";
import type * as smsIntake from "../smsIntake.js";
import type * as tourRequests from "../tourRequests.js";
import type * as tours from "../tours.js";
import type * as users from "../users.js";
import type * as visitorPreregistrations from "../visitorPreregistrations.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _diag: typeof _diag;
  addressIntake: typeof addressIntake;
  adminShell: typeof adminShell;
  agentCoverage: typeof agentCoverage;
  agreementSupersession: typeof agreementSupersession;
  agreements: typeof agreements;
  aiEngineOutputs: typeof aiEngineOutputs;
  auth: typeof auth;
  availability: typeof availability;
  buyerProfiles: typeof buyerProfiles;
  buyerUpdateEvents: typeof buyerUpdateEvents;
  closeDashboard: typeof closeDashboard;
  closeTasks: typeof closeTasks;
  communicationTemplates: typeof communicationTemplates;
  contractMilestones: typeof contractMilestones;
  contracts: typeof contracts;
  copilot: typeof copilot;
  counterOfferHistory: typeof counterOfferHistory;
  dashboard: typeof dashboard;
  dealRoomOverview: typeof dealRoomOverview;
  dealRoomRiskSummary: typeof dealRoomRiskSummary;
  dealRoomShareLinks: typeof dealRoomShareLinks;
  dealRooms: typeof dealRooms;
  deviceTokens: typeof deviceTokens;
  documentSummaries: typeof documentSummaries;
  "engines/compSeeder": typeof engines_compSeeder;
  "engines/compSeederMutations": typeof engines_compSeederMutations;
  "engines/comps": typeof engines_comps;
  "engines/compsQueries": typeof engines_compsQueries;
  "engines/cost": typeof engines_cost;
  "engines/insights": typeof engines_insights;
  "engines/insightsMutations": typeof engines_insightsMutations;
  "engines/leverage": typeof engines_leverage;
  "engines/offer": typeof engines_offer;
  "engines/orchestrate": typeof engines_orchestrate;
  "engines/orchestrateMutations": typeof engines_orchestrateMutations;
  "engines/pricing": typeof engines_pricing;
  enrichment: typeof enrichment;
  enrichmentJobs: typeof enrichmentJobs;
  externalAccess: typeof externalAccess;
  extractionMutations: typeof extractionMutations;
  extractionRunner: typeof extractionRunner;
  fileAnalysis: typeof fileAnalysis;
  fileFacts: typeof fileFacts;
  health: typeof health;
  http: typeof http;
  insights: typeof insights;
  intake: typeof intake;
  internalNotes: typeof internalNotes;
  kpiDashboard: typeof kpiDashboard;
  leadAttribution: typeof leadAttribution;
  ledger: typeof ledger;
  lenderCreditValidation: typeof lenderCreditValidation;
  "lib/addressMatch": typeof lib_addressMatch;
  "lib/assignmentRouting": typeof lib_assignmentRouting;
  "lib/attribution": typeof lib_attribution;
  "lib/availability": typeof lib_availability;
  "lib/buyerEvents": typeof lib_buyerEvents;
  "lib/buyerProfile": typeof lib_buyerProfile;
  "lib/closeTasks": typeof lib_closeTasks;
  "lib/comparison": typeof lib_comparison;
  "lib/contractProviders": typeof lib_contractProviders;
  "lib/counterofferHistory": typeof lib_counterofferHistory;
  "lib/dashboardDealIndex": typeof lib_dashboardDealIndex;
  "lib/documentSummary": typeof lib_documentSummary;
  "lib/engineResult": typeof lib_engineResult;
  "lib/externalAccessSession": typeof lib_externalAccessSession;
  "lib/leadAttribution": typeof lib_leadAttribution;
  "lib/lenderCreditValidate": typeof lib_lenderCreditValidate;
  "lib/offerEligibilityCompute": typeof lib_offerEligibilityCompute;
  "lib/overview": typeof lib_overview;
  "lib/promptVersion": typeof lib_promptVersion;
  "lib/rateLimitBuckets": typeof lib_rateLimitBuckets;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/riskSummary": typeof lib_riskSummary;
  "lib/scheduling": typeof lib_scheduling;
  "lib/session": typeof lib_session;
  "lib/shareLink": typeof lib_shareLink;
  "lib/shareLinkState": typeof lib_shareLinkState;
  "lib/smsIntakeCompute": typeof lib_smsIntakeCompute;
  "lib/templateRender": typeof lib_templateRender;
  "lib/validators": typeof lib_validators;
  "lib/watchlist": typeof lib_watchlist;
  listingResponses: typeof listingResponses;
  manualOverrides: typeof manualOverrides;
  messagePreferences: typeof messagePreferences;
  negotiationBriefs: typeof negotiationBriefs;
  offerCockpit: typeof offerCockpit;
  offerEligibility: typeof offerEligibility;
  opsQueues: typeof opsQueues;
  promptRegistry: typeof promptRegistry;
  properties: typeof properties;
  propertyCases: typeof propertyCases;
  propertyComparisons: typeof propertyComparisons;
  propertyMerge: typeof propertyMerge;
  rateLimits: typeof rateLimits;
  reconciliation: typeof reconciliation;
  releaseReadiness: typeof releaseReadiness;
  riskSummary: typeof riskSummary;
  "security/dataExport": typeof security_dataExport;
  "security/dataExportAction": typeof security_dataExportAction;
  "security/deletionRequest": typeof security_deletionRequest;
  "security/fileAccess": typeof security_fileAccess;
  settings: typeof settings;
  showingCoordination: typeof showingCoordination;
  showingPayouts: typeof showingPayouts;
  smsIntake: typeof smsIntake;
  tourRequests: typeof tourRequests;
  tours: typeof tours;
  users: typeof users;
  visitorPreregistrations: typeof visitorPreregistrations;
  watchlist: typeof watchlist;
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
