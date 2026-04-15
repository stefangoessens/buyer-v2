import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import { communicationChannel } from "./lib/validators";
import {
  extractPlaceholders,
  renderTemplate as renderTemplateLib,
} from "./lib/templateRender";
import type {
  CommunicationTemplateRecord,
} from "../packages/shared/src/communication-templates";
import {
  EMAIL_TEMPLATE_METADATA,
  compareCommunicationTemplateVersions,
  isValidCommunicationTemplateVersion,
} from "../packages/shared/src/communication-templates";

// ═══════════════════════════════════════════════════════════════════════════
// KIN-835 — Communication template registry
//
// Typed registry for outbound communication templates (email, SMS,
// in-app, push). Templates live in Convex — not in UI code — so ops
// and legal can edit copy without a code deploy. Every template
// declares its required variables explicitly and the render library
// validates that:
//
//   - the body's placeholders match the declared variable list, and
//   - inputs supplied at render time cover every declared variable.
//
// Versions are tracked as semver strings and only one version per
// (key, channel) pair is marked active at a time. All writes are
// broker/admin gated and produce audit log entries.
//
// The render library itself is pure TS and duplicated at
// `src/lib/templates/render.ts` for use from React Server Components
// and unit tests — the two files must stay in sync.
// ═══════════════════════════════════════════════════════════════════════════

const communicationTemplateRecordShape = {
  key: v.string(),
  channel: communicationChannel,
  version: v.string(),
  subject: v.optional(v.string()),
  body: v.string(),
  variables: v.array(v.string()),
  isActive: v.boolean(),
  description: v.optional(v.string()),
  author: v.string(),
  changeNotes: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
} as const;

const communicationTemplateDocValidator = v.object({
  _id: v.id("communicationTemplates"),
  _creationTime: v.number(),
  ...communicationTemplateRecordShape,
});

const communicationTemplateRenderResultValidator = v.object({
  subject: v.optional(v.string()),
  body: v.string(),
  version: v.string(),
});

type CommunicationTemplateRow = CommunicationTemplateRecord & {
  _id: Id<"communicationTemplates">;
  _creationTime: number;
};

type CommunicationTemplateRenderResult = {
  subject?: string;
  body: string;
  version: string;
};

const builtInEmailTemplateValidator = v.object({
  key: v.string(),
  channel: v.literal("email"),
  stream: v.union(v.literal("transactional"), v.literal("relationship")),
  description: v.string(),
  defaultSubject: v.string(),
  sourceFile: v.string(),
  variables: v.array(v.string()),
});

/**
 * Guard that every public function uses: returns the current user if
 * they are a broker or admin, throws otherwise. Buyers are never
 * allowed to read the template registry — the surface is ops-only.
 */
async function requireBrokerOrAdmin(ctx: Parameters<typeof requireAuth>[0]) {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Broker or admin role required");
  }
  return user;
}

// ═══ Queries ═════════════════════════════════════════════════════════════════

/**
 * Get the currently active template for a (key, channel) pair.
 * Returns null if no active version exists — callers that need a
 * template to exist should treat null as an error.
 */
export const getActive = query({
  args: {
    key: v.string(),
    channel: communicationChannel,
  },
  returns: v.union(v.null(), communicationTemplateDocValidator),
  handler: async (ctx, args) => {
    await requireBrokerOrAdmin(ctx);

    return await ctx.db
      .query("communicationTemplates")
      .withIndex("by_key_and_channel_and_isActive", (q) =>
        q.eq("key", args.key).eq("channel", args.channel).eq("isActive", true)
      )
      .unique();
  },
});

/**
 * List every version of a template by key. If `channel` is provided,
 * results are scoped to that channel; otherwise all channels for the
 * key are returned. Results are ordered newest first (by creation
 * time) so the console can show the version history in the usual
 * "latest on top" orientation.
 */
export const listByKey = query({
  args: {
    key: v.string(),
    channel: v.optional(communicationChannel),
  },
  returns: v.array(communicationTemplateDocValidator),
  handler: async (ctx, args) => {
    await requireBrokerOrAdmin(ctx);

    if (args.channel !== undefined) {
      // Narrow the optional to a local const so TypeScript knows the
      // value is defined inside the index callback.
      const channel = args.channel;
      return await ctx.db
        .query("communicationTemplates")
        .withIndex("by_key_and_channel", (q) =>
          q.eq("key", args.key).eq("channel", channel)
        )
        .order("desc")
        .collect();
    }

    // No channel filter — fetch every version across channels for this
    // key. We use the same compound index but only constrain the key.
    return await ctx.db
      .query("communicationTemplates")
      .withIndex("by_key_and_channel", (q) => q.eq("key", args.key))
      .order("desc")
      .collect();
  },
});

/**
 * List all templates that are currently marked active across every
 * (key, channel) pair. Used by the console overview and by ops health
 * checks to ensure every expected template has an active version.
 */
export const listActive = query({
  args: {},
  returns: v.array(communicationTemplateDocValidator),
  handler: async (ctx) => {
    await requireBrokerOrAdmin(ctx);

    return await ctx.db
      .query("communicationTemplates")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();
  },
});

/**
 * Built-in React Email registry metadata for the provider-backed templates
 * introduced by KIN-1092. This does not replace the editable Convex string
 * registry yet; it links canonical template keys to the code-rendered source
 * files so downstream tooling can converge on one template namespace.
 */
export const listBuiltInEmailTemplates = query({
  args: {},
  returns: v.array(builtInEmailTemplateValidator),
  handler: async (ctx) => {
    await requireBrokerOrAdmin(ctx);
    return EMAIL_TEMPLATE_METADATA.map((template) => ({
      key: template.key,
      channel: template.channel,
      stream: template.stream,
      description: template.description,
      defaultSubject: template.defaultSubject,
      sourceFile: template.sourceFile,
      variables: [...template.variables],
    }));
  },
});

// ═══ Mutations ═══════════════════════════════════════════════════════════════

/**
 * Create a new version of a template. The new version starts inactive
 * — callers must explicitly activate it via `activateVersion` once it
 * has been reviewed. This two-step pattern prevents a bad edit from
 * landing in production the moment it is saved.
 *
 * Validation performed up front:
 *   - `version` is semver major.minor.patch
 *   - the body's placeholders exactly match the declared variable list
 *   - no existing row with the same (key, channel, version)
 */
export const createVersion = mutation({
  args: {
    key: v.string(),
    channel: communicationChannel,
    version: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    variables: v.array(v.string()),
    description: v.optional(v.string()),
    author: v.string(),
    changeNotes: v.optional(v.string()),
  },
  returns: v.id("communicationTemplates"),
  handler: async (ctx, args) => {
    const user = await requireBrokerOrAdmin(ctx);

    // 1. Version format — we keep the format deliberately narrow
    //    (major.minor.patch) so the UI can show a simple bump control.
    if (!isValidCommunicationTemplateVersion(args.version)) {
      throw new Error(
        `Invalid version '${args.version}' — expected semver major.minor.patch`
      );
    }

    // 2. Declared vs used variables must match exactly across BOTH
    //    subject and body. We surface both "used but not declared" and
    //    "declared but not used" as errors so the author cannot
    //    accidentally save drift either way. Subject is validated too
    //    so email/push templates can use placeholders in the subject
    //    line without failing at render time.
    const bodyPlaceholders = extractPlaceholders(args.body);
    const subjectPlaceholders = args.subject
      ? extractPlaceholders(args.subject)
      : [];
    const allUsed = Array.from(
      new Set([...bodyPlaceholders, ...subjectPlaceholders])
    );
    const declaredSet = new Set(args.variables);
    const usedSet = new Set(allUsed);

    const undeclared = allUsed.filter((name) => !declaredSet.has(name));
    if (undeclared.length > 0) {
      throw new Error(
        `Template uses placeholders not declared in variables: ${undeclared.join(", ")}`
      );
    }
    const declaredButUnused = args.variables.filter(
      (name) => !usedSet.has(name)
    );
    if (declaredButUnused.length > 0) {
      throw new Error(
        `Declared variables not used in template subject or body: ${declaredButUnused.join(", ")}`
      );
    }

    // 3. Duplicate check — (key, channel, version) is the natural
    //    identity of a template row.
    const existing = (await ctx.db
      .query("communicationTemplates")
      .withIndex("by_key_and_channel", (q) =>
        q.eq("key", args.key).eq("channel", args.channel)
      )
      .collect()) as CommunicationTemplateRow[];

    const duplicate = existing.find(
      (t) =>
        compareCommunicationTemplateVersions(t.version, args.version) === 0
    );
    if (duplicate) {
      throw new Error(
        `Version ${args.version} already exists for (${args.key}, ${args.channel})`
      );
    }

    const now = new Date().toISOString();

    const id = await ctx.db.insert("communicationTemplates", {
      key: args.key,
      channel: args.channel,
      version: args.version,
      subject: args.subject,
      body: args.body,
      variables: args.variables,
      isActive: false, // new versions always start inactive
      description: args.description,
      author: args.author,
      changeNotes: args.changeNotes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "communication_template_created",
      entityType: "communicationTemplates",
      entityId: id,
      details: JSON.stringify({
        key: args.key,
        channel: args.channel,
        version: args.version,
        author: args.author,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Mark a specific template version as active. Deactivates any other
 * currently active version for the same (key, channel) pair so the
 * "at most one active per pair" invariant holds.
 *
 * Idempotent: activating an already-active version is a no-op that
 * still produces an audit entry for traceability.
 */
export const activateVersion = mutation({
  args: { templateId: v.id("communicationTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireBrokerOrAdmin(ctx);

    const target = await ctx.db.get(args.templateId);
    if (!target) throw new Error("Template not found");

    // Deactivate any currently active sibling for the same (key, channel).
    // We query via the compound index so we only scan siblings, not the
    // entire table.
    const currentActive = await ctx.db
      .query("communicationTemplates")
      .withIndex("by_key_and_channel_and_isActive", (q) =>
        q
          .eq("key", target.key)
          .eq("channel", target.channel)
          .eq("isActive", true)
      )
      .unique();

    const now = new Date().toISOString();

    if (currentActive && currentActive._id !== target._id) {
      await ctx.db.patch(currentActive._id, {
        isActive: false,
        updatedAt: now,
      });
    }

    if (!target.isActive) {
      await ctx.db.patch(target._id, { isActive: true, updatedAt: now });
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "communication_template_activated",
      entityType: "communicationTemplates",
      entityId: target._id,
      details: JSON.stringify({
        key: target.key,
        channel: target.channel,
        version: target.version,
        previousActiveId:
          currentActive && currentActive._id !== target._id
            ? currentActive._id
            : null,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Render the currently active template for a (key, channel) pair
 * with the supplied typed inputs. Throws with a clear message when:
 *
 *   - no active template exists for the pair, or
 *   - the render library rejects the inputs (missing variables, etc.)
 *
 * The returned `version` echoes the concrete version that was used so
 * callers can log exactly which template produced the message.
 */
export const renderTemplate = mutation({
  args: {
    key: v.string(),
    channel: communicationChannel,
    inputs: v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean())
    ),
  },
  returns: communicationTemplateRenderResultValidator,
  handler: async (ctx, args) => {
    await requireBrokerOrAdmin(ctx);

    const active = await ctx.db
      .query("communicationTemplates")
      .withIndex("by_key_and_channel_and_isActive", (q) =>
        q.eq("key", args.key).eq("channel", args.channel).eq("isActive", true)
      )
      .unique();

    if (!active) {
      throw new Error(
        `No active template for (key='${args.key}', channel='${args.channel}')`
      );
    }

    // Render the body first — this is the path every channel exercises.
    const bodyResult = renderTemplateLib(
      active.body,
      active.variables,
      args.inputs
    );
    if (!bodyResult.ok) {
      const msg = bodyResult.errors.map((e) => e.message).join("; ");
      throw new Error(`Template render failed (body): ${msg}`);
    }

    // Render the subject if the template has one. Email and push both
    // use subjects; SMS and in_app are body-only but we still render
    // whatever subject the template declares to keep the API uniform.
    let renderedSubject: string | undefined;
    if (active.subject !== undefined) {
      const subjectResult = renderTemplateLib(
        active.subject,
        active.variables,
        args.inputs
      );
      if (!subjectResult.ok) {
        const msg = subjectResult.errors.map((e) => e.message).join("; ");
        throw new Error(`Template render failed (subject): ${msg}`);
      }
      renderedSubject = subjectResult.rendered;
    }

    const result: CommunicationTemplateRenderResult = {
      subject: renderedSubject,
      body: bodyResult.rendered,
      version: active.version,
    };
    return result;
  },
});
