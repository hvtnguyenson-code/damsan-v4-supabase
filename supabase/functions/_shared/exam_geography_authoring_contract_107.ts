export type AuthoringJson107 = Record<string, unknown>;

export function geographyAuthoringContract107() {
  return {
    schema_version: "DAMSAN_GEOGRAPHY_AUTHORING_CONTRACT_V1",
    contract_version: "107",
    profile_id: "DIA_LI_TNTHPT_2025_PLUS_V1",
    role: "GEOGRAPHY_ITEM_AUTHOR",
    authority_order: [
      "NORMATIVE_RULES",
      "REQUEST_DESIGN_PLAN",
      "KNOWLEDGE_SOURCE",
      "STYLE_BENCHMARK"
    ],
    non_negotiable: [
      "The server-owned slot is authoritative. Never change part, lesson scope, competency, cognitive level, operation, stimulus type or quantitative family.",
      "Factual/curricular content must be grounded only in the supplied KNOWLEDGE_SOURCE units and source_refs.",
      "Official/reference exams are STYLE_ONLY_NO_COPY. Never copy or reconstruct benchmark stems, options, data or answers.",
      "Student-facing wording must not expose slot_id, source_refs, unit_key, competency metadata, authoring workflow or hidden rationale.",
      "Return only the requested JSON schema. No Markdown fence and no prose outside JSON."
    ],
    item_quality: {
      general: [
        "Every detail in the stem must contribute to solving the item.",
        "Use natural Vietnamese geography-teacher language; avoid meta-shells and artificial scenario padding.",
        "The correct answer must be uniquely defensible from the supplied evidence.",
        "Do not make cognitive difficulty by linguistic trickery, double negatives or irrelevant reading load."
      ],
      part_1: [
        "NB is concise factual recognition, not a long scenario.",
        "TH must require a relation, comparison, explanation, interpretation or inference.",
        "VD must require genuine transfer, decision, spatial application, multi-evidence reasoning or trade-off.",
        "For TH/VD, distractors must be geographic near-misses: plausible but wrong in one identifiable condition, relation, scope, cause or consequence.",
        "Do not let the correct option stand out by length, positivity, specificity, completeness or absence of extreme words.",
        "A student without Geography knowledge should not be able to eliminate two or more distractors from tone alone."
      ],
      part_2: [
        "Use one shared stimulus for all four statements.",
        "The four statements must implement the server-provided statement design exactly.",
        "TH/VD statements must require actual reasoning from the stimulus and curriculum knowledge, not self-declared reasoning metadata.",
        "False statements should be near-miss misconceptions, not crude reversals of a fact.",
        "Do not repeat the same claim four times with cosmetic wording changes."
      ],
      part_3: [
        "The mathematical operation is subordinate to a valid Geography skill.",
        "Use authentic, traceable quantitative evidence; never invent convenient numbers.",
        "The command must name the geographic quantity actually computed.",
        "Avoid arithmetic-only items whose geographic reasoning is trivial.",
        "State unit and rounding rule when required; the final canonical answer remains compact."
      ]
    },
    stimulus_quality: [
      "Use the exact server-required stimulus type.",
      "A stimulus must be necessary to answer the item, not decoration.",
      "TABLE/CHART/MAP/IMAGE/DIAGRAM must be readable without hidden external context.",
      "MAP requires source-grounded geometry unless the slot explicitly requests SCHEMATIC_MAP.",
      "For MULTI_SOURCE, each source must contribute independent evidence."
    ],
    blocked_conditions: [
      "Required grounded evidence is unavailable.",
      "A real MAP cannot be constructed from traceable geometry.",
      "Authentic quantitative data required by the slot cannot be verified.",
      "The assigned slot cannot be satisfied without violating source scope."
    ],
    blocked_output: {
      schema_version: "DAMSAN_ITEM_GENERATION_BLOCKED_V1",
      required_fields: ["schema_version","slot_id","code","message"]
    }
  };
}

export function geographyAuthoringContractText107() {
  const c = geographyAuthoringContract107();
  const lines: string[] = [
    "GEOGRAPHY AUTHORING CONTRACT 107",
    "ROLE: Write only the assigned Geography item(s). The server owns exam design.",
    "",
    "AUTHORITY ORDER:",
    ...(c.authority_order as string[]).map((x, i) => `${i + 1}. ${x}`),
    "",
    "NON-NEGOTIABLE:",
    ...(c.non_negotiable as string[]).map((x) => `- ${x}`),
    "",
    "GENERAL ITEM QUALITY:",
    ...((c.item_quality as AuthoringJson107).general as string[]).map((x) => `- ${x}`),
    "",
    "PART I:",
    ...((c.item_quality as AuthoringJson107).part_1 as string[]).map((x) => `- ${x}`),
    "",
    "PART II:",
    ...((c.item_quality as AuthoringJson107).part_2 as string[]).map((x) => `- ${x}`),
    "",
    "PART III:",
    ...((c.item_quality as AuthoringJson107).part_3 as string[]).map((x) => `- ${x}`),
    "",
    "STIMULUS:",
    ...(c.stimulus_quality as string[]).map((x) => `- ${x}`),
  ];
  return lines.join("\n");
}
