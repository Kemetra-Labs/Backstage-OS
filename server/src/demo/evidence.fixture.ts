// Synthetic fixture. `visibility` drives a DISPLAY switch only; it is not authorization.
export type EvidenceVisibility = "all" | "technical";

export const EVIDENCE: readonly { id: string; visibility: EvidenceVisibility; title: string }[] = [
  { id: "E-1", visibility: "all", title: "Synthetic build log summary" },
  { id: "E-5", visibility: "technical", title: "Synthetic error read" },
];
