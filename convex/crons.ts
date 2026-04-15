/**
 * Scheduled cron jobs for the buyer-v2 Convex backend.
 *
 * Only `crons.interval` and `crons.cron` are used here (per convex-rules.md —
 * the sugar helpers `hourly`/`daily`/`weekly` are deliberately avoided).
 *
 * Each cron references an internal action/mutation via its `internal.*`
 * function reference; never a direct symbol import.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// KIN-1078 — daily purge of disclosure packets past the 7-year
// `legal_documents` retention window. Runs once a day at 03:00 UTC
// to line up with the low-traffic window.
crons.cron(
  "disclosure packet retention purge",
  "0 3 * * *",
  internal.disclosuresRetentionPurge.purgeExpiredDisclosures,
  {},
);

export default crons;
