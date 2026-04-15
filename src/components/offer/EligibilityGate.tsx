// Brokerage-stage gate for the offer cockpit (KIN-1077).
// Replaces the old eligibility-warning lockout with the phone-first gate modal.
"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { BrokeragePhoneGateModal } from "./BrokeragePhoneGateModal";

interface EligibilityGateProps {
  brokerageStage: "none" | "requested" | "completed";
  dealRoomId: Id<"dealRooms">;
  propertyId: Id<"properties"> | string;
  listPrice: number;
  children: React.ReactNode;
}

export function EligibilityGate({
  brokerageStage,
  dealRoomId,
  propertyId,
  listPrice,
  children,
}: EligibilityGateProps) {
  if (brokerageStage !== "none") {
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
