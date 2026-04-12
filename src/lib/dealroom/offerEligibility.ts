export type EligibilityStatus = {
  eligible: boolean;
  currentAgreementType: "tour_pass" | "full_representation" | "none";
  requiredAction: "none" | "upgrade_to_full_rep" | "sign_agreement";
  reason: string;
};

/**
 * Determine offer eligibility from agreement state.
 * Eligible = has signed full_representation agreement.
 */
export function determineEligibility(
  agreements: Array<{ type: string; status: string }>
): EligibilityStatus {
  const signedFullRep = agreements.find(
    (a) => a.type === "full_representation" && a.status === "signed"
  );
  if (signedFullRep) {
    return {
      eligible: true,
      currentAgreementType: "full_representation",
      requiredAction: "none",
      reason: "Full representation agreement is signed. Offers are enabled.",
    };
  }

  const signedTourPass = agreements.find(
    (a) => a.type === "tour_pass" && a.status === "signed"
  );
  if (signedTourPass) {
    return {
      eligible: false,
      currentAgreementType: "tour_pass",
      requiredAction: "upgrade_to_full_rep",
      reason: "Tour Pass is signed but Full Representation is required to make offers. Upgrade needed.",
    };
  }

  return {
    eligible: false,
    currentAgreementType: "none",
    requiredAction: "sign_agreement",
    reason: "No signed agreement found. A Full Representation agreement is required to make offers.",
  };
}
