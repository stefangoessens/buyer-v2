// Brokerage-stage gate for the offer cockpit (KIN-1077).
// Replaces the old eligibility-warning lockout with the phone-first gate modal.
"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { BrokeragePhoneGateModal } from "./BrokeragePhoneGateModal";

interface EligibilityGateProps {
  brokerageStage: "none" | "requested" | "completed";
  // Broker/admin viewers bypass the gate entirely — the phone mutation rejects
  // non-buyers (`dealRoom.buyerId !== user._id`), so forcing staff into this
  // modal would hard-lock them out of the cockpit when reviewing a buyer's
  // deal room.
  viewerRole: "buyer" | "broker" | "admin";
  dealRoomId: Id<"dealRooms">;
  propertyId: Id<"properties"> | string;
  listPrice: number;
  children: React.ReactNode;
}

export function EligibilityGate({
  brokerageStage,
  viewerRole,
  dealRoomId,
  propertyId,
  listPrice,
  children,
}: EligibilityGateProps) {
  if (viewerRole !== "buyer" || brokerageStage !== "none") {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <BrokeragePhoneGateModal
        open
        onOpenChange={() => {
          /* non-dismissable — server flip unmounts via parent re-render */
        }}
        dealRoomId={dealRoomId}
        propertyId={String(propertyId)}
        listPrice={listPrice}
      />
    </>
  );
}
