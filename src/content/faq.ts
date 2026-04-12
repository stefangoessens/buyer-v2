import type { FAQEntry } from "@/lib/content/types";

/**
 * Canonical FAQ catalog for the public site (KIN-773).
 *
 * Every entry has an explicit visibility flag. Internal-only entries
 * (ops playbook clarifications, agent training notes) stay in this
 * file for single-source review but are stripped before public render
 * by `filterPublic`.
 */
export const FAQ_ENTRIES: FAQEntry[] = [
  // ─── Getting started ───────────────────────────────────────────────
  {
    id: "what_is_buyer_v2",
    category: "getting_started",
    question: "What is buyer-v2?",
    answer:
      "buyer-v2 is an AI-native Florida buyer brokerage. We help you analyze any listing you paste, negotiate on your behalf, and rebate a portion of the buyer-agent commission back to you at closing.",
    visibility: "public",
  },
  {
    id: "who_can_use_buyer_v2",
    category: "getting_started",
    question: "Who can use buyer-v2?",
    answer:
      "Anyone buying a home in Florida. We're a licensed Florida real estate brokerage. If you're shopping outside Florida today, join our waitlist — we'll let you know when we expand.",
    visibility: "public",
  },
  {
    id: "paste_link_flow",
    category: "getting_started",
    question: "How does the paste-a-link flow work?",
    answer:
      "Paste any Zillow, Redfin, or Realtor.com URL on our homepage. We fetch the listing, normalize the property data, run our AI pricing and comps analysis, and surface everything in a free deal room — usually in under 10 seconds.",
    visibility: "public",
  },

  // ─── Pricing ───────────────────────────────────────────────────────
  {
    id: "how_much_does_it_cost",
    category: "pricing",
    question: "How much does buyer-v2 cost?",
    answer:
      "buyer-v2 is free to browse and free to engage. Our fee comes out of the buyer-agent commission at closing — we never charge you up front. If a listing has no buyer-agent commission, we'll tell you before you engage.",
    visibility: "public",
  },
  {
    id: "how_is_the_rebate_calculated",
    category: "pricing",
    question: "How is my buyer credit calculated?",
    answer:
      "We rebate a portion of the buyer-agent commission back to you at closing. The exact percentage depends on the listing's co-broke offer and is disclosed before you sign a buyer representation agreement. Use our savings calculator to see a typical example.",
    visibility: "public",
  },
  {
    id: "agent_bonus_split",
    category: "pricing",
    question: "Internal: agent bonus split for referrals?",
    answer:
      "Referral bonuses are split 70/30 between the closing broker and the referring partner. This is internal-only — do not share publicly.",
    visibility: "internal",
  },

  // ─── Process ───────────────────────────────────────────────────────
  {
    id: "who_shows_me_homes",
    category: "process",
    question: "Who actually shows me homes?",
    answer:
      "Our network of licensed Florida showing agents. You book a tour through the deal room and we dispatch the closest agent with coverage in that area. You meet them at the property.",
    visibility: "public",
  },
  {
    id: "can_i_negotiate_myself",
    category: "process",
    question: "Can I negotiate the offer myself?",
    answer:
      "You can submit offers yourself through our AI-assisted offer tool, or you can hand negotiation off to one of our licensed brokers. Most buyers choose the assisted path and let us run counter-offers.",
    visibility: "public",
  },
  {
    id: "what_happens_at_closing",
    category: "process",
    question: "What happens at closing?",
    answer:
      "You close at a title company just like any other Florida transaction. The buyer credit shows up on your closing disclosure as a reduction of closing costs or cash to close (subject to lender approval).",
    visibility: "public",
  },

  // ─── Legal ─────────────────────────────────────────────────────────
  {
    id: "is_buyer_v2_a_broker",
    category: "legal",
    question: "Is buyer-v2 a licensed real estate brokerage?",
    answer:
      "Yes. buyer-v2 is a licensed Florida real estate brokerage. All license-critical actions — buyer representation agreements, compensation disclosures, and contract execution — are reviewed by a licensed broker.",
    visibility: "public",
  },
  {
    id: "what_about_ai_decisions",
    category: "legal",
    question: "Does AI make decisions on my behalf?",
    answer:
      "No. AI helps analyze listings, comps, and offer scenarios, but license-critical actions (agreements, compensation, contract terms, calls) are always reviewed by a human licensed broker. You'll see every AI recommendation before anything happens.",
    visibility: "public",
  },

  // ─── Technical ─────────────────────────────────────────────────────
  {
    id: "do_you_support_mls_direct",
    category: "technical",
    question: "Do you pull listings directly from the MLS?",
    answer:
      "We normalize listings from the major portals you already use (Zillow, Redfin, Realtor.com). Direct MLS feeds are on our roadmap but not required — every listing you'd see on a portal is in scope today.",
    visibility: "public",
  },
  {
    id: "is_my_data_private",
    category: "technical",
    question: "Is my data private?",
    answer:
      "Yes. We never sell your data and never share it with third parties for marketing. Your deal room is private to you and the licensed broker assigned to your deal. See our Privacy Policy for details.",
    visibility: "public",
  },
  {
    id: "internal_eng_roadmap",
    category: "technical",
    question: "Internal: current engineering priorities?",
    answer:
      "iOS launch, multi-state expansion foundations, and AI engine v2. Internal-only.",
    visibility: "internal",
  },
];
