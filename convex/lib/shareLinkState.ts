import {
  canRevoke,
  resolveShareLink,
  type RawShareLink,
  type ResolveReason,
  type ShareLinkScope,
} from "./shareLink";

export interface ShareLinkActor {
  userId: string;
  role: "buyer" | "broker" | "admin";
}

export interface ShareLinkDealRoomRef<
  DealRoomId extends string = string,
  UserId extends string = string,
> {
  dealRoomId: DealRoomId;
  buyerId: UserId;
}

export interface ShareLinkCreateArgs<
  DealRoomId extends string = string,
  UserId extends string = string,
> {
  actor: ShareLinkActor & { userId: UserId };
  dealRoom: ShareLinkDealRoomRef<DealRoomId, UserId> | null;
  scope: ShareLinkScope;
  expiresAt: string | null;
  now: string;
  slug: string;
}

export interface ShareLinkCreatePlan<
  DealRoomId extends string = string,
  UserId extends string = string,
> {
  createdByUserId: UserId;
  link: {
    dealRoomId: DealRoomId;
    createdByUserId: UserId;
    slug: string;
    scope: ShareLinkScope;
    status: "active";
    createdAt: string;
    expiresAt?: string;
    accessCount: number;
  };
  event: {
    dealRoomId: DealRoomId;
    event: "created";
    actorUserId: UserId;
    timestamp: string;
    details: string;
  };
  audit: {
    userId: UserId;
    action: "deal_room_share_link_created";
    entityType: "dealRoomShareLinks";
    details: string;
    timestamp: string;
  };
}

export interface ShareLinkResolveSuccessPlan<
  LinkId extends string = string,
  DealRoomId extends string = string,
> {
  ok: true;
  response: {
    ok: true;
    linkId: LinkId;
    dealRoomId: DealRoomId;
    scope: ShareLinkScope;
  };
  patch: {
    accessCount: number;
    lastAccessedAt: string;
  };
  event: {
    linkId: LinkId;
    dealRoomId: DealRoomId;
    event: "resolved";
    timestamp: string;
  };
}

export interface ShareLinkResolveFailurePlan<
  LinkId extends string = string,
  DealRoomId extends string = string,
> {
  ok: false;
  response: {
    ok: false;
    reason: ResolveReason;
  };
  event?:
    | {
        linkId: LinkId;
        dealRoomId: DealRoomId;
        event: "denied_expired" | "denied_revoked";
        timestamp: string;
      }
    | undefined;
  audit?:
    | {
        action: "deal_room_share_link_denied_not_found";
        entityType: "dealRoomShareLinks";
        entityId: "unknown";
        details: string;
        timestamp: string;
      }
    | undefined;
}

export type ShareLinkResolvePlan<
  LinkId extends string = string,
  DealRoomId extends string = string,
> =
  | ShareLinkResolveSuccessPlan<LinkId, DealRoomId>
  | ShareLinkResolveFailurePlan<LinkId, DealRoomId>;

export interface ShareLinkRevokePlan<
  LinkId extends string = string,
  DealRoomId extends string = string,
  UserId extends string = string,
> {
  patch: {
    status: "revoked";
    revokedAt: string;
    revokedByUserId: UserId;
  };
  event: {
    linkId: LinkId;
    dealRoomId: DealRoomId;
    event: "revoked";
    actorUserId: UserId;
    timestamp: string;
  };
  audit: {
    userId: UserId;
    action: "deal_room_share_link_revoked";
    entityType: "dealRoomShareLinks";
    entityId: LinkId;
    timestamp: string;
  };
}

export function planCreateShareLink<
  DealRoomId extends string,
  UserId extends string,
>(args: ShareLinkCreateArgs<DealRoomId, UserId>): ShareLinkCreatePlan<
  DealRoomId,
  UserId
> {
  if (!args.dealRoom) {
    throw new Error("Deal room not found");
  }

  const isOwner = args.dealRoom.buyerId === args.actor.userId;
  const isStaff = args.actor.role === "broker" || args.actor.role === "admin";
  if (!isOwner && !isStaff) {
    throw new Error("You are not authorized to share this deal room.");
  }

  if (args.expiresAt) {
    const nowMs = parseInstant(args.now);
    const expiresAtMs = parseInstant(args.expiresAt);
    if (nowMs === null || expiresAtMs === null || expiresAtMs <= nowMs) {
      throw new Error("expiresAt must be in the future");
    }
  }

  const createdByUserId = args.dealRoom.buyerId;
  return {
    createdByUserId,
    link: {
      dealRoomId: args.dealRoom.dealRoomId,
      createdByUserId,
      slug: args.slug,
      scope: args.scope,
      status: "active",
      createdAt: args.now,
      expiresAt: args.expiresAt ?? undefined,
      accessCount: 0,
    },
    event: {
      dealRoomId: args.dealRoom.dealRoomId,
      event: "created",
      actorUserId: args.actor.userId,
      timestamp: args.now,
      details: JSON.stringify({
        scope: args.scope,
        expiresAt: args.expiresAt,
      }),
    },
    audit: {
      userId: args.actor.userId,
      action: "deal_room_share_link_created",
      entityType: "dealRoomShareLinks",
      details: JSON.stringify({
        dealRoomId: args.dealRoom.dealRoomId,
        scope: args.scope,
      }),
      timestamp: args.now,
    },
  };
}

export function planResolveShareLink<
  LinkId extends string,
  DealRoomId extends string,
>(
  link:
    | (RawShareLink & {
        _id: LinkId;
        dealRoomId: DealRoomId;
      })
    | null,
  slug: string,
  now: string,
): ShareLinkResolvePlan<LinkId, DealRoomId> {
  const result = resolveShareLink(link, now);
  if (!result.ok) {
    if (link) {
      return {
        ok: false,
        response: {
          ok: false,
          reason: result.reason,
        },
        event: {
          linkId: link._id,
          dealRoomId: link.dealRoomId,
          event:
            result.reason === "expired"
              ? "denied_expired"
              : "denied_revoked",
          timestamp: now,
        },
      };
    }

    return {
      ok: false,
      response: {
        ok: false,
        reason: result.reason,
      },
      audit: {
        action: "deal_room_share_link_denied_not_found",
        entityType: "dealRoomShareLinks",
        entityId: "unknown",
        details: JSON.stringify({
          slugPrefix: slug.slice(0, 4),
          slugLength: slug.length,
        }),
        timestamp: now,
      },
    };
  }

  return {
    ok: true,
    response: {
      ok: true,
      linkId: link!._id,
      dealRoomId: link!.dealRoomId,
      scope: result.resolved.scope,
    },
    patch: {
      accessCount: link!.accessCount + 1,
      lastAccessedAt: now,
    },
    event: {
      linkId: link!._id,
      dealRoomId: link!.dealRoomId,
      event: "resolved",
      timestamp: now,
    },
  };
}

export function planRevokeShareLink<
  LinkId extends string,
  DealRoomId extends string,
  UserId extends string,
>(
  link:
    | (RawShareLink & {
        _id: LinkId;
        dealRoomId: DealRoomId;
      })
    | null,
  actor: ShareLinkActor & { userId: UserId },
  now: string,
): ShareLinkRevokePlan<LinkId, DealRoomId, UserId> {
  if (!link) {
    throw new Error("Share link not found");
  }

  const check = canRevoke(link, actor.userId, actor.role);
  if (!check.ok) {
    throw new Error(check.reason);
  }

  return {
    patch: {
      status: "revoked",
      revokedAt: now,
      revokedByUserId: actor.userId,
    },
    event: {
      linkId: link._id,
      dealRoomId: link.dealRoomId,
      event: "revoked",
      actorUserId: actor.userId,
      timestamp: now,
    },
    audit: {
      userId: actor.userId,
      action: "deal_room_share_link_revoked",
      entityType: "dealRoomShareLinks",
      entityId: link._id,
      timestamp: now,
    },
  };
}

function parseInstant(iso: string): number | null {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
