export type ContactStatus = 'new' | 'contacted' | 'meeting' | 'qualified' | 'unreachable';

export type EntityType = 'pj' | 'pf' | 'both';

export type PlatformType = 'google_maps' | 'google_business' | 'google_search' | 'linkedin' | 'instagram' | 'website' | 'facebook' | 'tiktok' | 'other';

export interface FieldEvidence {value: unknown; sourceUrl: string; source: string; retrievedAt: string; excerpt: string;}
export interface Provenance {professionalContacts?:ProfessionalContact[];corporateOfficers?:Array<{nome:string;qualificacao:string}>;companyContactLabel?:string;authorDeclaredLocation?:string;publicationLocation?:string;groupContext?:string;evidence?: Record<string, FieldEvidence>; verificationStatus?: 'source_observed'; recordType?: 'purchase_mention'|'marketplace_product'|'marketplace_question'|'potential_company'; prospectSector?:string; prospectingBasis?:string; intent?: string; authorProfileUrl?: string; publishedAt?: string; geographicStatus?: string; matchedProduct?: string;}
export interface Contact extends Provenance {
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
  // 🆕 Campos da Casa dos Dados + Apify
  tem_whatsapp?: boolean | null;
  telefone_receita?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  socios?: Array<{ nome: string; qualificacao: string }>;
  match_score?: number;
  website?: string | null;
}

export interface ExtractedResult extends Provenance {
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
  // 🆕 Campos da Casa dos Dados + Apify
  tem_whatsapp?: boolean | null;
  telefone_receita?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  socios?: Array<{ nome: string; qualificacao: string }>;
  match_score?: number;
  website?: string | null;
}

export interface SearchIntelligenceMeta {
  intent: 'b2b_procurement' | 'b2c_consumer' | 'market_demand' | 'direct_search' | 'hybrid';
  summary: string;
  targetAudience: string;
  trendingItems?: string[];
  suggestedPitch?: string;
  warnings?: string[];
  executionReport?: ExecutionReport;
  retrievedAt?: string;
  requestedCount?: number;
  returnedCount?: number;
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

export interface MarketplaceSignal extends Provenance {
 platform: 'shopee'|'mercado_livre';recordType: 'marketplace_product'|'marketplace_question';sourceUrl:string;name?:string;priceBRL?:number;priceIsPix?:boolean;shippingOrigin?:string;soldCount?:number;soldPeriod?:string;question?:string;questionId?:string;regionalMatch?:boolean|null;buyerIdentityAvailable:false;
}

export interface ProfessionalContact {name:string;role:string;company:string;phone:string;email:string;evidence:Record<string,FieldEvidence>;fieldStatus:Record<string,string>;buyerAuthority:string;}
export interface ExecutionSource {source:string;status:string;consulted:boolean;received:number;qualified:number;discarded:Record<string,number>;errors:string[];limits:string[];providerCostUsd:number|null;providerCredits?:number;marketSignals?:number;normalized?:number;pages?:number;providerTotal?:number|null;runId?:string;url?:string;query?:string;balance?:string;reservedUsd?:number;cacheHit?:boolean;collectedAt?:number;expiresAt?:number;}
export interface ExecutionReport {state:string;summary:string;generatedAt:string;sources:ExecutionSource[];reusedExecution?:boolean;manualSearchLinks?:Array<{q:string;url:string}>;}
