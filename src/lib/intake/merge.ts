import type { SourceRecord, MergeResult, FieldProvenance } from "./types";
import { SOURCE_PRIORITY } from "./types";

/** Fields that are portal-specific estimates — never merged, stored separately */
const PORTAL_ESTIMATE_FIELDS = [
  "zestimate",
  "redfinEstimate",
  "realtorEstimate",
];

/** Fields where county records are preferred over portal data */
const COUNTY_PREFERRED_FIELDS = [
  "taxAnnual",
  "taxAssessedValue",
  "folioNumber",
  "address",
];

/**
 * Get the source priority for a field. County records are preferred for tax/legal fields.
 */
function getFieldPriority(field: string, source: string): number {
  if (COUNTY_PREFERRED_FIELDS.includes(field) && source === "county") {
    return -1; // Highest possible priority for county on these fields
  }
  return SOURCE_PRIORITY[source] ?? 99;
}

/**
 * Merge multiple source records into a canonical property record.
 *
 * Rules:
 * 1. Portal estimates (zestimate, redfinEstimate, realtorEstimate) are NEVER merged —
 *    each is stored in its own field from its respective source only
 * 2. For all other fields, highest-priority source wins on conflict
 * 3. Per-field provenance tracks: source, value, confidence, fetchedAt, conflictFlag
 * 4. Conflicts are logged with all source values and resolution reason
 */
export function mergeSourceRecords(sources: SourceRecord[]): MergeResult {
  const mergedFields: Record<string, unknown> = {};
  const provenance: Record<string, FieldProvenance> = {};
  const conflicts: MergeResult["conflicts"] = [];

  // Collect all field values from all sources
  const fieldSources: Record<
    string,
    Array<{
      platform: string;
      value: unknown;
      fetchedAt: string;
      priority: number;
    }>
  > = {};

  for (const source of sources) {
    for (const [field, value] of Object.entries(source.data)) {
      if (value === undefined || value === null || value === "") continue;

      // Portal estimates go directly to their own field
      if (PORTAL_ESTIMATE_FIELDS.includes(field)) {
        mergedFields[field] = value;
        provenance[field] = {
          source: source.sourcePlatform,
          value,
          confidence: 0.9,
          fetchedAt: source.fetchedAt,
          conflictFlag: false,
        };
        continue;
      }

      if (!fieldSources[field]) fieldSources[field] = [];
      fieldSources[field].push({
        platform: source.sourcePlatform,
        value,
        fetchedAt: source.fetchedAt,
        priority: getFieldPriority(field, source.sourcePlatform),
      });
    }
  }

  // Resolve each field
  for (const [field, fieldValues] of Object.entries(fieldSources)) {
    if (fieldValues.length === 0) continue;

    // Sort by priority (lowest number = highest priority)
    fieldValues.sort((a, b) => a.priority - b.priority);

    const winner = fieldValues[0];
    mergedFields[field] = winner.value;

    // Check for conflicts (different values across sources)
    const uniqueValues = new Set(
      fieldValues.map((v) => JSON.stringify(v.value))
    );
    const hasConflict = uniqueValues.size > 1;

    provenance[field] = {
      source: winner.platform,
      value: winner.value,
      confidence: hasConflict ? 0.7 : 0.95,
      fetchedAt: winner.fetchedAt,
      conflictFlag: hasConflict,
    };

    if (hasConflict) {
      conflicts.push({
        field,
        sources: fieldValues.map((v) => ({
          platform: v.platform,
          value: v.value,
        })),
        resolved: winner.value,
        resolution: `Resolved by source priority: ${winner.platform} (priority ${winner.priority})`,
      });
    }
  }

  return {
    mergedFields,
    provenance,
    conflicts,
    sourceCount: sources.length,
    mergedAt: new Date().toISOString(),
  };
}
