export type ContactStatus = 'new' | 'contacted' | 'meeting' | 'qualified' | 'unreachable';

export type EntityType = 'pj' | 'pf' | 'both';

export type PlatformType = 'google_maps' | 'google_business' | 'google_search' | 'linkedin' | 'instagram' | 'website' | 'other';

export interface Contact {
  id?: string;
  name: string;
  cnpj?: string;
  phone: string;
  whatsapp?: string;
  establishmentPhone?: string;
  decisionMakerPhone?: string;
  legalSource?: string;
  email?: string;
  instagram?: string;
  location: string;
  profileUrl: string;
  platform: PlatformType;
  entityType?: 'pj' | 'pf';
  category?: string;
  company?: string;
  role?: string;
  department?: string;
  decisionMaker?: string;
  pitchRecommendation?: string;
  trendingInsights?: string[];
  competitorPrices?: string;
  demandTimeframe?: string;
  rating?: number;
  reviewsCount?: number;
  confidence?: number;
  isVerifiable?: boolean;
  veracityScore?: number;
  veracityReason?: string;
  status: ContactStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExtractedResult {
  name: string;
  cnpj?: string;
  phone: string;
  whatsapp?: string;
  establishmentPhone?: string;
  decisionMakerPhone?: string;
  legalSource?: string;
  email?: string;
  instagram?: string;
  location: string;
  profileUrl: string;
  platform: PlatformType;
  entityType?: 'pj' | 'pf';
  category?: string;
  company?: string;
  role?: string;
  department?: string;
  decisionMaker?: string;
  pitchRecommendation?: string;
  trendingInsights?: string[];
  competitorPrices?: string;
  demandTimeframe?: string;
  rating?: number;
  reviewsCount?: number;
  confidence?: number;
}

export interface SearchIntelligenceMeta {
  intent: 'b2b_procurement' | 'b2c_consumer' | 'market_demand' | 'direct_search' | 'hybrid';
  summary: string;
  targetAudience: string;
  trendingItems?: string[];
  suggestedPitch?: string;
  page?: number;
  offset?: number;
  totalHarvested?: number;
}

export interface ExtractionApiConfig {
  apiUrl: string;
  apiKey: string;
  authHeaderName: string;
  requestMethod: 'POST' | 'GET';
  useCustomApi: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}
