import type { YalcCampaignKind } from "@/lib/yalc/campaign-kind";

/**
 * Partnerships (SAN-78) · tipos compartidos UI ↔ proxies Yalc.
 *
 * Espejo del shape que devuelven los proxies de SAN-77:
 *  - GET  /api/yalc/leads               → { leads: PartnershipLead[], count }
 *    (serializeLead de Yalc src/lib/server/routes/leads.ts)
 *  - PATCH /api/yalc/leads/[id]/stage   → { ok, leadId, oldStatus, newStatus, discardNote }
 *  - GET  /api/yalc/campaigns           → { campaigns: PartnershipCampaign[] }
 *
 * CLIENT-SAFE: sin imports de Node — lo consumen componentes y tests.
 */

/** Componentes del quality score tal y como los persiste Yalc (objeto, no array). */
export interface QualityComponentsMap {
  erVsTier: number;
  authenticity: number;
  sectorFit: number;
  audienceEs: number;
  consistency: number;
}

/** Lead de Yalc con los campos Partnerships (todos los creator-fields son nullables). */
export interface PartnershipLead {
  id: string;
  campaignId: string;
  campaignTitle?: string | null;
  campaignType?: string | null;
  campaignKind?: YalcCampaignKind;
  campaignKindLabel?: string;
  providerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  company?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  lifecycleStatus?: string | null;
  qualificationScore?: number | null;
  source?: string | null;
  tags?: string[];
  // ── Partnerships / creator fields ──
  handle?: string | null;
  network?: string | null;
  profileUrl?: string | null;
  followers?: number | null;
  engagementRate?: number | null;
  tier?: string | null;
  offeredPrice?: number | null;
  dealTerms?: Record<string, unknown> | null;
  qualityScore?: number | null;
  qualityComponents?: Partial<QualityComponentsMap> | null;
  discardNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PartnershipLeadsPayload {
  leads?: PartnershipLead[];
  count?: number;
}

/** Campaña Yalc (una búsqueda de Partnerships = campaña type=Partnerships). */
export interface PartnershipCampaign {
  id: string;
  title?: string;
  status?: string;
  type?: string | null;
  campaignKind?: YalcCampaignKind;
  campaignKindLabel?: string;
  hypothesis?: string | null;
  targetSegment?: string | null;
  qualificationMode?: string | null;
  disqualifyThreshold?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  leadCount?: number;
  funnel?: Record<string, number>;
}

export interface PartnershipCampaignsPayload {
  campaigns?: PartnershipCampaign[];
}

export interface StagePatchResponse {
  ok: boolean;
  leadId: string;
  oldStatus: string;
  newStatus: string;
  discardNote: string | null;
}
