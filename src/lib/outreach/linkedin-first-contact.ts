export interface LinkedInFirstContactCandidate {
  linkedinUrl?: string | null;
  lifecycleStatus?: string | null;
}

/** Initial LinkedIn sends are restricted to leads explicitly approved by a human. */
export function linkedInFirstContactCandidates<T extends LinkedInFirstContactCandidate>(leads: T[]): T[] {
  return leads.filter(
    (lead) => Boolean(lead.linkedinUrl?.trim()) && lead.lifecycleStatus === "Qualified",
  );
}
