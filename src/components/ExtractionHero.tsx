import React, { useState, useMemo } from 'react';
import { 
  Zap, 
  Search, 
  MapPin, 
  Phone, 
  Building2, 
  Copy, 
  Check, 
  ExternalLink, 
  MessageSquare, 
  PhoneCall, 
  BookmarkPlus, 
  RotateCw, 
  RotateCcw,
  RefreshCw,
  Sparkles, 
  Link as LinkIcon, 
  Star, 
  CheckCheck,
  Globe,
  SlidersHorizontal,
  X,
  AlertCircle,
  TrendingUp,
  UserCheck,
  Briefcase,
  Target,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Flame,
  Mail,
  Clock,
  DollarSign,
  User,
  Users,
  Layers,
  Plus,
  Tractor,
  Fuel,
  Download,
  FileText,
  Instagram,
  ShieldCheck
} from 'lucide-react';
import type { ExtractedResult, ExtractionApiConfig, Contact, SearchIntelligenceMeta, EntityType } from '../types';
import { searchGoogleLeads, searchB2CLeads, extractFromDirectUrl, isUrl } from '../services/extractionService';
import { addContactToFirestore, batchAddContactsToFirestore } from '../services/contactService';
import { hasPurchaseIntent } from '../utils/purchaseIntent';
import { InstagramLogo } from './InstagramLogo';
import { resolveInstagram } from '../utils/instagramHelper';
import { resolveGeographicLocation } from '../utils/geoData';

interface ExtractionHeroProps {
  userId: string;
  apiConfig: ExtractionApiConfig;
  onContactSaved: (contact: Contact) => void;
  onOpenSettings: () => void;
  clearTrigger?: number;
  onExtractedCountChange?: (count: number) => void;
  onOpenDatabasePage?: () => void;
}

// Helper to dynamically harmonize the objective based on term and location
function buildHarmonizedObjective(term: string, loc: string): string {
  const cleanTerm = term.trim();
  const cleanLoc = loc.trim();
  if (!cleanTerm && !cleanLoc) return '';
  if (!cleanTerm) return `estabelecimentos e decisores comerciais em ${cleanLoc} com telefone direto e localização`;
  if (!cleanLoc) return `${cleanTerm} com decisor de compras, telefone com DDD e dados cadastrais`;

  const lower = cleanTerm.toLowerCase();
  if (lower.includes('posto') || lower.includes('combust') || lower.includes('gasolina') || lower.includes('diesel')) {
    return `posto de combustível em ${cleanLoc} com nome do gerente de compras, telefone comercial com DDD e localização`;
  }
  if (lower.includes('cana') || lower.includes('rural') || lower.includes('fazenda') || lower.includes('agric')) {
    return `produtor rural de cana-de-açúcar em ${cleanLoc} com nome do produtor titular, contato WhatsApp, nome da fazenda e usina atendida`;
  }
  if (lower.includes('usina') || lower.includes('açúcar') || lower.includes('etanol') || lower.includes('bioenergia')) {
    return `comprador de clarificante, moenda e insumos industriais em usinas de ${cleanLoc}`;
  }
  if (lower.includes('supermerc') || lower.includes('atacad') || lower.includes('varej')) {
    return `chefe de compras e setor de suprimentos de supermercados em ${cleanLoc} com telefone direto`;
  }
  if (lower.includes('farmacia') || lower.includes('drogaria') || lower.includes('medicament')) {
    return `comprador de medicamentos, suplementos e cosméticos em farmácias de ${cleanLoc}`;
  }
  if (lower.includes('transporte') || lower.includes('frota') || lower.includes('logistica')) {
    return `gerente de logística e suprimentos de transportadoras em ${cleanLoc} comprando peças, pneus e combustível`;
  }
  if (lower.includes('constru') || lower.includes('incorpor')) {
    return `departamento de suprimentos de construtoras em ${cleanLoc} adquirindo aço, cimento e materiais`;
  }
  if (lower.includes('restauran') || lower.includes('bar') || lower.includes('gastronom')) {
    return `proprietário e gerente de compras de restaurantes em ${cleanLoc} adquirindo insumos alimentícios e embalagens`;
  }
  return `${cleanTerm} em ${cleanLoc} com decisor comercial, telefone verificado com DDD e dados cadastrais`;
}

export function ExtractionHero({
  userId,
  apiConfig,
  onContactSaved,
  onOpenSettings,
  clearTrigger,
  onExtractedCountChange,
  onOpenDatabasePage,
}: ExtractionHeroProps) {
  // Modes: 'search' (Google Search & Maps by Term + Location) vs 'url' (Direct URL / Google Maps Link)
  const [activeTab, setActiveTab] = useState<'search' | 'url'>('search');
  
  // Search state - 3 Integrated & Synchronized Consultation Pillars
  const [searchTerm, setSearchTerm] = useState('Posto de Combustível');
  const [locationTerm, setLocationTerm] = useState('Ribeirão Preto, SP');
  const [searchObjective, setSearchObjective] = useState('posto de combustível em Ribeirão Preto, SP com nome do gerente de compras, telefone comercial com DDD e localização');
  const [isObjectiveCustom, setIsObjectiveCustom] = useState(false);
  const [leadCount, setLeadCount] = useState<number>(4);
  const [targetEntityType, setTargetEntityType] = useState<EntityType>('pj');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [harvestedNames, setHarvestedNames] = useState<string[]>([]);

  // Real-time resolved geographic & telephony info
  const resolvedGeo = useMemo(() => {
    return resolveGeographicLocation(locationTerm, searchTerm);
  }, [locationTerm, searchTerm]);

  // Synchronized input handlers
  const handleSearchTermChange = (newTerm: string) => {
    setSearchTerm(newTerm);
    if (!isObjectiveCustom) {
      setSearchObjective(buildHarmonizedObjective(newTerm, locationTerm));
    }
  };

  const handleLocationTermChange = (newLoc: string) => {
    setLocationTerm(newLoc);
    if (!isObjectiveCustom) {
      setSearchObjective(buildHarmonizedObjective(searchTerm, newLoc));
    }
  };

  const handleObjectiveChange = (newObjective: string) => {
    setSearchObjective(newObjective);
    setIsObjectiveCustom(true);
  };

  const handleSyncObjective = () => {
    const synced = buildHarmonizedObjective(searchTerm, locationTerm);
    setSearchObjective(synced);
    setIsObjectiveCustom(false);
  };

  // URL state
  const [urlInput, setUrlInput] = useState('');

  // Execution state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Extracted Results List & Intelligence Meta
  const [extractedList, setExtractedList] = useState<ExtractedResult[]>([]);
  const [searchMeta, setSearchMeta] = useState<SearchIntelligenceMeta | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedEstIndex, setCopiedEstIndex] = useState<number | null>(null);
  const [copiedEmailIndex, setCopiedEmailIndex] = useState<number | null>(null);
  const [copiedInstagramIndex, setCopiedInstagramIndex] = useState<number | null>(null);

  React.useEffect(() => {
    if (clearTrigger && clearTrigger > 0) {
      setExtractedList([]);
      setSearchMeta(null);
      setSavedIds(new Set());
      setError(null);
    }
  }, [clearTrigger]);

  React.useEffect(() => {
    if (onExtractedCountChange) {
      onExtractedCountChange(extractedList.length);
    }
  }, [extractedList.length, onExtractedCountChange]);

  // Quick preset pills for Google Search & High-precision B2B/B2C Scenarios (100% harmonized)
  const quickPresets = [
    { 
      label: '⛽ Postos de Combustível (Gerente de Compras & Telefone)', 
      term: 'Posto de Combustível', 
      objective: 'posto de combustível em Ribeirão Preto, SP com nome do gerente de compras, telefone comercial com DDD e localização',
      loc: 'Ribeirão Preto, SP',
      entity: 'pj' as EntityType
    },
    { 
      label: '🌾 Produtores de Cana MG (Fazenda / Produtor / Contato)', 
      term: 'Produtor Rural de Cana-de-Açúcar', 
      objective: 'produtor rural de cana-de-açúcar em Minas Gerais com nome do produtor titular, contato WhatsApp, nome da fazenda e usina atendida',
      loc: 'Minas Gerais, MG',
      entity: 'pj' as EntityType
    },
    { 
      label: '🚚 Frotas & Transportadoras (Gerente de Logística)', 
      term: 'Transportadoras e Frotas de Carga', 
      objective: 'gerente de logística e suprimentos de transportadoras em Campinas, SP comprando peças, pneus e combustível',
      loc: 'Campinas, SP',
      entity: 'pj' as EntityType
    },
    { 
      label: '🛒 Supermercados & Atacarejos (Chefe de Compras)', 
      term: 'Supermercados e Atacadistas', 
      objective: 'chefe de compras e setor de suprimentos de supermercados em Belo Horizonte, MG com telefone direto',
      loc: 'Belo Horizonte, MG',
      entity: 'pj' as EntityType
    },
    { 
      label: '💊 Farmácias & Drogarias (Suprimentos & Dermo)', 
      term: 'Redes de Drogarias e Farmácias', 
      objective: 'comprador de medicamentos, suplementos e cosméticos em farmácias de São Paulo, SP',
      loc: 'São Paulo, SP',
      entity: 'pj' as EntityType
    },
    { 
      label: '🏭 Usinas SP (Clarificante / Moenda)', 
      term: 'Usinas de Açúcar e Álcool', 
      objective: 'comprador de clarificante, moenda e insumos industriais em usinas de São Paulo, SP',
      loc: 'São Paulo, SP',
      entity: 'pj' as EntityType
    },
    { 
      label: '🎯 Caminhonete Usada (Consumidores Finais)', 
      term: 'Caminhonete Usada', 
      objective: 'radar de pessoas físicas buscando comprar caminhonete usada em Goiânia, GO',
      loc: 'Goiânia, GO',
      entity: 'pf' as EntityType
    },
    { 
      label: '🛒 Eletrodomésticos 24h (Consumidores Finais)', 
      term: 'Eletrodomésticos e Utilidades', 
      objective: 'compradores de micro-ondas, aspirador de pó e fogão elétrico nas últimas 24h em São Paulo, SP',
      loc: 'São Paulo, SP',
      entity: 'both' as EntityType
    },
    { 
      label: '🏗️ Construtoras (Aço & Materiais Estruturais)', 
      term: 'Construtoras e Incorporadoras', 
      objective: 'departamento de suprimentos de construtoras em Curitiba, PR adquirindo aço CA-50, cimento e materiais',
      loc: 'Curitiba, PR',
      entity: 'pj' as EntityType
    },
    { 
      label: '🍽️ Restaurantes & Bares (Proprietário & Compras)', 
      term: 'Restaurantes e Bares Comerciais', 
      objective: 'proprietário e gerente de compras de restaurantes em Rio de Janeiro, RJ adquirindo insumos alimentícios e embalagens',
      loc: 'Rio de Janeiro, RJ',
      entity: 'pj' as EntityType
    },
  ];

  const handleClearSearch = () => {
    setSearchTerm('');
    setLocationTerm('');
    setSearchObjective('');
    setIsObjectiveCustom(false);
    setError(null);
  };

  const handleRefreshSearch = () => {
    handleSearchGoogle();
  };

  const handleClearResults = () => {
    setExtractedList([]);
    setSearchMeta(null);
    setSavedIds(new Set());
    setError(null);
  };

  const handleSearchGoogle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const effectiveTerm = searchTerm.trim() || 'Empresas e Serviços';
    const effectiveLoc = locationTerm.trim() || `${resolvedGeo.city}, ${resolvedGeo.state}`;
    const effectiveObjective = searchObjective.trim() || buildHarmonizedObjective(effectiveTerm, effectiveLoc);

    if (!searchTerm.trim() && !searchObjective.trim()) {
      setError('Por favor, informe o que deseja buscar (ex: Posto de combustível, Supermercado, Usina) ou o requisito de busca.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setExtractedList([]);
    setSearchMeta(null);
    setSavedIds(new Set());
    setCurrentPage(1);
    setHarvestedNames([]);

    try {
      const displayQuery = effectiveObjective || effectiveTerm;
      setLoadingStatus(`Processando inteligência Blitz 360 e mapeando clientes reais para: "${displayQuery}"...`);
      await new Promise((r) => setTimeout(r, 150));

      const freshSeed = Date.now();

      // 🔀 ROTEAMENTO: B2C (Radar de Intenção de Compra) vs B2B (Empresas & Decisores)
      let response;
      if (targetEntityType === 'pf') {
        setLoadingStatus(`🎯 Rastreando menções públicas de pessoas buscando comprar "${effectiveTerm}"...`);
        await new Promise((r) => setTimeout(r, 150));
        response = await searchB2CLeads(effectiveTerm, effectiveLoc, leadCount);
      } else {
        setLoadingStatus('Extraindo contatos diretos (PF & PJ), intenção de busca e localização...');
        response = await searchGoogleLeads(
          effectiveTerm, 
          effectiveLoc, 
          leadCount, 
          apiConfig, 
          effectiveObjective,
          1,
          0,
          [],
          targetEntityType,
          'cluster',
          freshSeed
        );
      }

      setExtractedList(response.leads);
      setHarvestedNames(response.leads.map(l => l.name));
      if (response.meta) {
        setSearchMeta(response.meta);
      }

      // Automatically save extracted leads to Firestore for frictionless user experience
      if (userId && response.leads.length > 0) {
        setLoadingStatus('Salvando contatos e inteligência no Firestore...');
        const contactsToSave = response.leads.map((r) => {
          const noteParts = [
            searchObjective ? `Objetivo: ${searchObjective}` : '',
            r.entityType === 'pf' ? 'Tipo: Pessoa Física (Consumidor)' : 'Tipo: Pessoa Jurídica (Empresa/CNPJ)',
            r.trendingInsights && r.trendingInsights.length > 0 ? `Itens procurados: ${r.trendingInsights.join(', ')}` : '',
            `Extraído via Blitz 360 AI Engine (${effectiveTerm} - ${r.location})`
          ].filter(Boolean);

          const insta = resolveInstagram(r);

          return {
            name: r.name,
            entityType: r.entityType || (targetEntityType === 'pf' ? 'pf' : 'pj'),
            phone: r.phone || '',
            email: r.email || '',
            instagram: insta.handle || '',
            location: r.location || '',
            profileUrl: r.profileUrl || '',
            platform: r.platform || 'google_maps',
            category: r.category || effectiveTerm,
            department: r.department || '',
            decisionMaker: r.decisionMaker || '',
            pitchRecommendation: r.pitchRecommendation || '',
            trendingInsights: Array.isArray(r.trendingInsights) ? r.trendingInsights : [],
            competitorPrices: r.competitorPrices || '',
            demandTimeframe: r.demandTimeframe || '',
            rating: typeof r.rating === 'number' ? r.rating : 4.8,
            reviewsCount: typeof r.reviewsCount === 'number' ? r.reviewsCount : 0,
            status: 'new' as const,
            notes: noteParts.join(' | '),
            cnpj: r.cnpj || '',
            establishmentPhone: r.establishmentPhone || '',
            whatsapp: r.whatsapp || '',
            decisionMakerPhone: r.decisionMakerPhone || '',
            legalSource: r.legalSource || '',
          };
        });

        await batchAddContactsToFirestore(userId, contactsToSave);
        const allIndices = new Set<number>(response.leads.map((_, i) => i));
        setSavedIds(allIndices);
        
        // Notify parent
        onContactSaved({
          ...contactsToSave[0],
          id: 'temp-batch',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair contatos. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleFetchMoreLeads = async () => {
    const effectiveTerm = searchTerm.trim() || searchObjective.trim();
    if (!effectiveTerm) return;

    setIsLoadingMore(true);
    setError(null);
    const nextPage = currentPage + 1;

    try {
      // Para B2C, sempre pega nova safra via mesma rota (não tem paginação real ainda)
      let response;
      if (targetEntityType === 'pf') {
        response = await searchB2CLeads(effectiveTerm, locationTerm, leadCount);
      } else {
        response = await searchGoogleLeads(
          effectiveTerm,
          locationTerm,
          leadCount,
          apiConfig,
          searchObjective.trim(),
          nextPage,
          extractedList.length,
          harvestedNames,
          targetEntityType,
          'cluster',
          Date.now()
        );
      }

      if (response.leads && response.leads.length > 0) {
        const newTotalList = [...extractedList, ...response.leads];
        setExtractedList(newTotalList);
        setHarvestedNames(newTotalList.map(l => l.name));
        setCurrentPage(nextPage);

        // Auto-save batch to Firestore
        if (userId) {
          const contactsToSave = response.leads.map((r) => {
            const noteParts = [
              searchObjective ? `Objetivo: ${searchObjective}` : '',
              r.entityType === 'pf' ? 'Tipo: Pessoa Física (Consumidor)' : 'Tipo: Pessoa Jurídica (Empresa/CNPJ)',
              r.trendingInsights && r.trendingInsights.length > 0 ? `Itens procurados: ${r.trendingInsights.join(', ')}` : '',
              `Safra #${nextPage} Blitz 360 (${effectiveTerm} - ${r.location})`
            ].filter(Boolean);

            const insta = resolveInstagram(r);

            return {
              name: r.name,
              entityType: r.entityType || (targetEntityType === 'pf' ? 'pf' : 'pj'),
              phone: r.phone || '',
              email: r.email || '',
              instagram: insta.handle || '',
              location: r.location || '',
              profileUrl: r.profileUrl || '',
              platform: r.platform || 'google_maps',
              category: r.category || effectiveTerm,
              department: r.department || '',
              decisionMaker: r.decisionMaker || '',
              pitchRecommendation: r.pitchRecommendation || '',
              trendingInsights: Array.isArray(r.trendingInsights) ? r.trendingInsights : [],
              competitorPrices: r.competitorPrices || '',
              demandTimeframe: r.demandTimeframe || '',
              rating: typeof r.rating === 'number' ? r.rating : 4.8,
              reviewsCount: typeof r.reviewsCount === 'number' ? r.reviewsCount : 0,
              status: 'new' as const,
              notes: noteParts.join(' | '),
              cnpj: r.cnpj || '',
              establishmentPhone: r.establishmentPhone || '',
              whatsapp: r.whatsapp || '',
              decisionMakerPhone: r.decisionMakerPhone || '',
              legalSource: r.legalSource || '',
            };
          });

          await batchAddContactsToFirestore(userId, contactsToSave);
          const allIndices = new Set<number>(newTotalList.map((_, i) => i));
          setSavedIds(allIndices);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar novos clientes.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleExtractUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim()) {
      setError('Por favor, insira um link ou URL válido (Google Maps, Perfil ou Website).');
      return;
    }

    setError(null);
    setIsLoading(true);
    setExtractedList([]);
    setSearchMeta(null);
    setSavedIds(new Set());

    try {
      setLoadingStatus('Extraindo informações da URL...');
      const result = await extractFromDirectUrl(urlInput, apiConfig);
      
      setExtractedList([result]);

      // Auto save single contact
      if (userId) {
        const contactData = {
          name: result.name,
          phone: result.phone || '',
          email: result.email || '',
          instagram: result.instagram || '',
          location: result.location || '',
          profileUrl: result.profileUrl || '',
          platform: result.platform || 'website',
          category: result.category || 'Link Direto',
          department: result.department || '',
          decisionMaker: result.decisionMaker || '',
          pitchRecommendation: result.pitchRecommendation || '',
          trendingInsights: Array.isArray(result.trendingInsights) ? result.trendingInsights : [],
          competitorPrices: result.competitorPrices || '',
          demandTimeframe: result.demandTimeframe || '',
          rating: typeof result.rating === 'number' ? result.rating : 4.8,
          reviewsCount: typeof result.reviewsCount === 'number' ? result.reviewsCount : 0,
          status: 'new' as const,
          notes: 'Extraído via Link Direto',
          cnpj: result.cnpj || '',
          establishmentPhone: result.establishmentPhone || '',
          whatsapp: result.whatsapp || '',
          decisionMakerPhone: result.decisionMakerPhone || '',
          legalSource: result.legalSource || '',
        };
        const newId = await addContactToFirestore(userId, contactData);
        setSavedIds(new Set([0]));
        onContactSaved({
          ...contactData,
          id: newId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair dados da URL.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleCopyPhone = (phoneNum: string, index: number) => {
    navigator.clipboard.writeText(phoneNum);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyEstPhone = (phoneNum: string, index: number) => {
    navigator.clipboard.writeText(phoneNum);
    setCopiedEstIndex(index);
    setTimeout(() => setCopiedEstIndex(null), 2000);
  };

  const handleCopyEmail = (emailStr: string, index: number) => {
    navigator.clipboard.writeText(emailStr);
    setCopiedEmailIndex(index);
    setTimeout(() => setCopiedEmailIndex(null), 2000);
  };

  const handleCopyInstagram = (instaStr: string, index: number) => {
    navigator.clipboard.writeText(instaStr);
    setCopiedInstagramIndex(index);
    setTimeout(() => setCopiedInstagramIndex(null), 2000);
  };

  const cleanPhone = (p: string) => p.replace(/\D/g, '');

  const handleDownloadResultsCSV = () => {
    if (extractedList.length === 0) return;
    const headers = [
      'Tipo (PF/PJ)',
      'Nome / Razão Social / Posto / Fazenda',
      'CNPJ',
      'Gerente de Compras / Decisor Titular',
      'WhatsApp Direto (Decisor / Compras)',
      'Telefone Estabelecimento (Fixo / Central)',
      'Origem Jurídica / Registro',
      'Instagram (Perfil / Endereço)',
      'Localização Completa',
      'E-mail',
      'Categoria / Bandeira',
      'Departamento / Setor',
      'Estratégia de Venda / Pitch',
      'Cotações & Itens Buscados',
      'Preços Concorrentes',
      'Link / Google Maps',
      'Data de Extração'
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const rows = extractedList.map((lead) => {
      const entityLabel = lead.entityType === 'pf' ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)';
      const insta = resolveInstagram(lead);
      const estPhone = lead.establishmentPhone || lead.phone;
      const decPhone = lead.decisionMakerPhone || lead.whatsapp || lead.phone;
      const legSource = lead.legalSource || (lead.entityType === 'pj' ? 'Contrato Social / Junta Comercial / Registro em Cartório / QSA Receita Federal' : 'Registro Público');
      return [
        escapeCsv(entityLabel),
        escapeCsv(lead.company || lead.name),
        escapeCsv(lead.cnpj || ''),
        escapeCsv(lead.decisionMaker || ''),
        escapeCsv(decPhone),
        escapeCsv(estPhone),
        escapeCsv(legSource),
        escapeCsv(insta.handle),
        escapeCsv(lead.location),
        escapeCsv(lead.email || ''),
        escapeCsv(lead.category || ''),
        escapeCsv(lead.department || ''),
        escapeCsv(lead.pitchRecommendation || ''),
        escapeCsv(lead.trendingInsights ? lead.trendingInsights.join('; ') : ''),
        escapeCsv(lead.competitorPrices || ''),
        escapeCsv(lead.profileUrl || ''),
        escapeCsv(new Date().toLocaleString('pt-BR'))
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedQuery = (searchTerm || 'leads').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `leads_${sanitizedQuery}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadResultsTXT = () => {
    if (extractedList.length === 0) return;
    const lines: string[] = [
      '================================================================================',
      'LISTA DE CONTATOS & DECISORES EXTRAÍDOS',
      `Busca: ${searchTerm || 'Geral'} | Localização: ${locationTerm || 'Brasil'}`,
      `Total: ${extractedList.length} contatos | Data: ${new Date().toLocaleString('pt-BR')}`,
      '================================================================================\n'
    ];

    extractedList.forEach((lead, idx) => {
      const insta = resolveInstagram(lead);
      const estPhone = lead.establishmentPhone || lead.phone;
      const decPhone = lead.decisionMakerPhone || lead.whatsapp || lead.phone;
      lines.push(`${idx + 1}. NOME / POSTO / FAZENDA: ${lead.company || lead.name}`);
      if (lead.cnpj) {
        lines.push(`   CNPJ: ${lead.cnpj}`);
      }
      if (lead.decisionMaker) {
        lines.push(`   GERENTE DE COMPRAS / DECISOR / SÓCIO: ${lead.decisionMaker}`);
      }
      lines.push(`   WHATSAPP DIRETO (DECISOR): ${decPhone}`);
      lines.push(`   TELEFONE ESTABELECIMENTO (FIXO/CENTRAL): ${estPhone}`);
      if (lead.legalSource) {
        lines.push(`   ORIGEM JURÍDICA / REGISTRO: ${lead.legalSource}`);
      }
      lines.push(`   INSTAGRAM: ${insta.handle} (${insta.url})`);
      lines.push(`   LOCALIZAÇÃO: ${lead.location}`);
      if (lead.email) {
        lines.push(`   E-MAIL: ${lead.email}`);
      }
      if (lead.category) {
        lines.push(`   BANDEIRA / CATEGORIA: ${lead.category}`);
      }
      if (lead.department) {
        lines.push(`   SETOR / SUPRIMENTOS: ${lead.department}`);
      }
      if (lead.pitchRecommendation) {
        lines.push(`   PITCH RECOMENDADO: ${lead.pitchRecommendation}`);
      }
      lines.push('--------------------------------------------------------------------------------\n');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedQuery = (searchTerm || 'leads').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `contatos_${sanitizedQuery}_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 via-zinc-900/60 to-zinc-950/80 p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
      
      {/* Decorative ambient glow */}
      <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />

      <div className="relative z-10 max-w-4xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-medium text-indigo-300 mb-3 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Inteligência de Vendas B2B & Decisores Corporativos em Tempo Real</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white mb-2">
            Prospecção & Busca de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-300">Clientes, Postos & Empresas</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl mx-auto">
            Digite o nicho (ex: <strong>Posto de combustível</strong>, <strong>Supermercados</strong>, <strong>Usinas</strong>) e a cidade para extrair <strong>gerente de compras</strong>, <strong>telefone/WhatsApp direto com DDD</strong> e <strong>localização</strong>.
          </p>
        </div>

        {/* Extraction Mode Tabs */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('search');
                setError(null);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Search className="h-4 w-4" />
              <span>Busca de Empresas, Postos & Decisores</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('url');
                setError(null);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                activeTab === 'url'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LinkIcon className="h-4 w-4" />
              <span>Extrair por Link / URL Direto</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Google Search by Term + Location */}
        {activeTab === 'search' && (
          <form onSubmit={handleSearchGoogle} className="space-y-4">
            <div className="rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-4 sm:p-5 shadow-2xl ring-1 ring-white/5 space-y-4">
              
              {/* Top Filter Row: Entity Type + Quick Clear */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Tipo de Público:</span>
                  </span>
                  <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5">
                    <button
                      type="button"
                      onClick={() => setTargetEntityType('pj')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                        targetEntityType === 'pj'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Pessoa Jurídica (B2B)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetEntityType('pf')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                        targetEntityType === 'pf'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Pessoa Física (B2C)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetEntityType('both')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                        targetEntityType === 'both'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Ambos</span>
                    </button>
                  </div>
                </div>

                {(searchTerm || locationTerm || searchObjective) && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition py-1 px-2 rounded-md hover:bg-zinc-800/80"
                    title="Limpar campos de busca"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Limpar Busca</span>
                  </button>
                )}
              </div>

              {/* 3 Pilares Integrados de Consulta */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  
                  {/* Item 1: O que você quer buscar? */}
                  <div className="md:col-span-5 relative flex items-center rounded-xl bg-zinc-900/90 px-3.5 py-2.5 border border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition">
                    <Search className="h-5 w-5 text-indigo-400 shrink-0 mr-2.5" />
                    <div className="w-full">
                      <label htmlFor="search-term-input" className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        1. O que você quer buscar?
                      </label>
                      <input
                        id="search-term-input"
                        type="text"
                        placeholder={
                          targetEntityType === 'pf'
                            ? 'Ex: caminhonete usada, balança para gado, tênis de corrida...'
                            : 'Ex: Posto de combustível, Supermercado...'
                        }
                        value={searchTerm}
                        onChange={(e) => handleSearchTermChange(e.target.value)}
                        disabled={isLoading || isLoadingMore}
                        className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-medium mt-0.5"
                      />
                    </div>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => handleSearchTermChange('')}
                        className="p-1 text-zinc-500 hover:text-zinc-300 ml-1"
                        title="Limpar termo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Item 2: Cidade & Estado */}
                  <div className="md:col-span-3 relative flex items-center rounded-xl bg-zinc-900/90 px-3.5 py-2.5 border border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition">
                    <MapPin className="h-5 w-5 text-emerald-400 shrink-0 mr-2.5" />
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <label htmlFor="location-term-input" className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                          2. Cidade & Estado
                        </label>
                        {resolvedGeo.ddd && (
                          <span className="text-[9px] font-semibold text-emerald-400/90 bg-emerald-950/40 px-1 rounded">
                            DDD {resolvedGeo.ddd}
                          </span>
                        )}
                      </div>
                      <input
                        id="location-term-input"
                        type="text"
                        placeholder="Ex: Ribeirão Preto, SP..."
                        value={locationTerm}
                        onChange={(e) => handleLocationTermChange(e.target.value)}
                        disabled={isLoading || isLoadingMore}
                        className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-medium mt-0.5"
                      />
                    </div>
                    {locationTerm && (
                      <button
                        type="button"
                        onClick={() => handleLocationTermChange('')}
                        className="p-1 text-zinc-500 hover:text-zinc-300 ml-1"
                        title="Limpar cidade"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="md:col-span-2 rounded-xl bg-zinc-900/90 px-3 py-2 border border-zinc-800">
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                      Qtd
                    </label>
                    <select
                      value={leadCount}
                      onChange={(e) => setLeadCount(Number(e.target.value))}
                      disabled={isLoading || isLoadingMore}
                      className="w-full bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer mt-0.5"
                    >
                      <option value={3} className="bg-zinc-900">3 Contatos</option>
                      <option value={4} className="bg-zinc-900">4 Contatos</option>
                      <option value={6} className="bg-zinc-900">6 Contatos</option>
                      <option value={10} className="bg-zinc-900">10 Contatos</option>
                    </select>
                  </div>

                  {/* Actions: Search Button + Quick Refresh Button */}
                  <div className="md:col-span-2 flex items-center gap-1.5">
                    <button
                      id="btn-search-google"
                      type="submit"
                      disabled={isLoading || isLoadingMore || (!searchTerm.trim() && !searchObjective.trim())}
                      className="flex-1 h-full min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-3 py-2 text-xs sm:text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-50 transition cursor-pointer"
                      title="Buscar contatos e decisores sincronizados nas fontes públicas"
                    >
                      {isLoading ? (
                        <RotateCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="h-4 w-4 fill-white shrink-0" />
                          <span>Buscar</span>
                        </>
                      )}
                    </button>

                    <button
                      id="btn-refresh-search"
                      type="button"
                      onClick={handleRefreshSearch}
                      disabled={isLoading || isLoadingMore || (!searchTerm.trim() && !searchObjective.trim())}
                      className="h-full min-h-[46px] w-11 flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                      title="Atualizar busca e carregar nova safra de contatos"
                    >
                      <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                </div>

                {/* Linha 2: Item 3: Requisito ou Intenção Específica */}
                <div className="relative flex items-center rounded-xl bg-zinc-900/90 px-3.5 py-2.5 border border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition">
                  <Target className="h-5 w-5 text-amber-400 shrink-0 mr-2.5" />
                  <div className="w-full">
                    <div className="flex items-center justify-between">
                      <label htmlFor="search-objective-input" className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        3. Requisito ou Intenção Específica
                      </label>
                      <div className="flex items-center gap-2">
                        {isObjectiveCustom ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-amber-400/90 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                              ✏️ Requisito Personalizado
                            </span>
                            <button
                              type="button"
                              onClick={handleSyncObjective}
                              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1 transition"
                              title="Sincronizar automaticamente com o termo e a cidade"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              <span>Re-sincronizar</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>Sincronizado automaticamente</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      id="search-objective-input"
                      type="text"
                      placeholder="Ex: posto de combustível em Ribeirão Preto, SP com nome do gerente de compras, telefone com DDD e localização..."
                      value={searchObjective}
                      onChange={(e) => handleObjectiveChange(e.target.value)}
                      disabled={isLoading || isLoadingMore}
                      className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-medium mt-0.5"
                    />
                  </div>
                  {searchObjective && (
                    <button
                      type="button"
                      onClick={() => handleObjectiveChange('')}
                      className="p-1 text-zinc-500 hover:text-zinc-300 ml-1"
                      title="Limpar requisito específico"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Barra de Auditoria de Integração Multi-Fontes */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-zinc-400 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-zinc-500 font-medium">Fontes Auditadas em Tempo Real:</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                      <Building2 className="h-3 w-3 text-blue-400" /> Receita Federal & QSA
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                      <FileText className="h-3 w-3 text-emerald-400" /> Licitações PNCP
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                      <ShieldCheck className="h-3 w-3 text-purple-400" /> Diários Oficiais
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
                      <Globe className="h-3 w-3 text-indigo-400" /> Jusbrasil & Escavador
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Localidade: <strong className="text-zinc-300">{resolvedGeo.city} - {resolvedGeo.state}</strong> (DDD {resolvedGeo.ddd})
                  </div>
                </div>
              </div>

            </div>

            {/* Quick Presets Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Atalhos Rápidos de Busca:
                </span>
                <span className="text-[11px] text-zinc-500">Clique para carregar parâmetros prontos</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {quickPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchTerm(preset.term);
                      setLocationTerm(preset.loc);
                      setSearchObjective(preset.objective);
                      setTargetEntityType(preset.entity);
                      setIsObjectiveCustom(false);
                      setError(null);
                    }}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-indigo-500/50 hover:bg-zinc-800 hover:text-white transition flex items-center gap-1.5 group"
                  >
                    <span>{preset.label}</span>
                    <ChevronRight className="h-3 w-3 text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-zinc-500 flex items-center justify-between pt-1">
                <span>Motor: <strong>Blitz 360 AI Deep Intelligence (PF & PJ Multicanal)</strong></span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-indigo-400 hover:underline"
                >
                  Configurações de API
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: Direct URL Extraction */}
        {activeTab === 'url' && (
          <form onSubmit={handleExtractUrl} className="space-y-4">
            <div className="relative rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-2.5 shadow-2xl ring-1 ring-white/5 flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-indigo-400">
                <LinkIcon className="h-5 w-5" />
              </div>
              <input
                id="direct-url-input"
                type="text"
                placeholder="Cole o link do Google Maps, LinkedIn ou Website aqui..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isLoading}
                className="w-full bg-transparent py-2 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-medium"
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={() => setUrlInput('')}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading || !urlInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 transition cursor-pointer"
              >
                {isLoading ? (
                  <RotateCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-white" />
                    <span>Extrair</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Exemplos suportados: Links do Google Maps (<code className="text-zinc-400">maps.google.com</code>), perfis do LinkedIn ou qualquer site institucional.
            </p>
          </form>
        )}

        {/* Loading Banner */}
        {isLoading && (
          <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 text-center animate-pulse">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-indigo-300 mb-1">
              <RotateCw className="h-4 w-4 animate-spin" />
              <span>{loadingStatus || 'Consultando inteligência de mercado e decisores...'}</span>
            </div>
            <p className="text-xs text-zinc-400">
              Rastreando setores específicos, nomes de responsáveis por compras, telefones diretos e validando endereços.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-200">Aviso na busca</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Search Intelligence Summary Meta Box */}
        {searchMeta && (
          <div className="mt-6 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-zinc-950/80 p-4 sm:p-5 shadow-xl animate-in fade-in">
            <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider mb-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>Inteligência Estratégica Blitz 360</span>
            </div>

            <p className="text-sm font-medium text-white mb-3">
              {searchMeta.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {searchMeta.targetAudience && (
                <div className="rounded-lg bg-zinc-900/80 p-3 border border-zinc-800/80">
                  <span className="block text-[10px] uppercase font-bold text-indigo-400 mb-1">
                    🎯 Perfil de Decisores Mapeados
                  </span>
                  <span className="text-zinc-300">{searchMeta.targetAudience}</span>
                </div>
              )}

              {searchMeta.suggestedPitch && (
                <div className="rounded-lg bg-zinc-900/80 p-3 border border-zinc-800/80">
                  <span className="block text-[10px] uppercase font-bold text-emerald-400 mb-1">
                    💡 Pitch Recomendado para Venda
                  </span>
                  <span className="text-zinc-300">{searchMeta.suggestedPitch}</span>
                </div>
              )}
            </div>

            {searchMeta.trendingItems && searchMeta.trendingItems.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Itens / Demandas em Destaque:
                </span>
                {searchMeta.trendingItems.map((item, idx) => (
                  <span key={idx} className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state alert */}
        {!isLoading && !error && searchMeta && extractedList.length === 0 && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 text-center animate-in fade-in">
            <div className="flex items-center justify-center gap-2 text-amber-400 font-bold text-sm mb-1">
              <AlertCircle className="h-5 w-5" />
              <span>{searchMeta.summary || `Nenhum resultado auditado encontrado para ${searchTerm} em ${locationTerm}. Verifique os termos ou tente outra região.`}</span>
            </div>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
              Diretriz anti-alucinação ativa: o Blitz 360 PRO não substitui o nicho solicitado e não gera dados fictícios.
            </p>
          </div>
        )}

        {/* Extracted Results Display Section */}
        {extractedList.length > 0 && (
          <div className="mt-8 space-y-4 animate-in fade-in zoom-in-95 duration-300">
            
            {/* Results Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-emerald-400">
                    {extractedList.length} {extractedList.length === 1 ? 'Contato Assertivo Encontrado' : 'Contatos & Decisores Encontrados'}
                  </h3>
                </div>
                {(searchTerm || locationTerm) && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Filtro: <strong className="text-zinc-200">{searchTerm || 'Geral'}</strong> {locationTerm ? <>em <strong className="text-emerald-300">{locationTerm}</strong></> : ''} • {targetEntityType === 'pf' ? <span className="text-purple-300 font-medium">Radar de Intenção (B2C)</span> : <span className="text-amber-300 font-medium">Gerente de Compras & Suprimentos</span>}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshSearch}
                  disabled={isLoading || isLoadingMore}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/60 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Atualizar busca e carregar novas opções de contatos"
                >
                  <RotateCw className={`h-3.5 w-3.5 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar Busca</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadResultsCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 px-3 py-1.5 text-xs font-bold text-emerald-300 transition shadow-sm hover:shadow-emerald-500/20 cursor-pointer"
                  title="Baixar lista completa em arquivo CSV"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Baixar Planilha CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadResultsTXT}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition shadow-sm cursor-pointer"
                  title="Baixar lista em arquivo TXT"
                >
                  <FileText className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Baixar TXT</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearResults}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/50 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:text-white transition cursor-pointer shadow-sm"
                  title="Limpar resultados da tela"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  <span>Limpar Tela</span>
                </button>
                {onOpenDatabasePage && (
                  <button
                    type="button"
                    onClick={onOpenDatabasePage}
                    className="text-xs text-emerald-300 hover:text-white font-medium flex items-center gap-1 ml-1 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                    title="Abrir página do Banco de Contatos"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Salvo no Banco</span>
                    <ExternalLink className="h-3 w-3 ml-0.5 text-emerald-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Extracted Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extractedList.map((lead, index) => {
                const establishmentPhone = lead.establishmentPhone || lead.phone;
                const decisionMakerPhone = lead.decisionMakerPhone || lead.whatsapp;
                const hasDistinctLeadPhones = Boolean(decisionMakerPhone && establishmentPhone && decisionMakerPhone !== establishmentPhone);
                const cleanMainPhone = cleanPhone(lead.phone);
                const cleanEstPhoneNum = cleanPhone(establishmentPhone);
                const cleanDecisionPhoneNum = cleanPhone(decisionMakerPhone || lead.phone);
                const cleanPhoneNum = cleanDecisionPhoneNum || cleanMainPhone;
                const insta = resolveInstagram(lead);
                const isB2CMode = targetEntityType === 'pf';

                return (
                  <div
                    key={index}
                    className="relative rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 sm:p-5 shadow-xl hover:border-zinc-700 transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                              lead.entityType === 'pf' 
                                ? 'bg-purple-500/15 text-purple-400' 
                                : 'bg-blue-500/15 text-blue-400'
                            }`}>
                              {lead.entityType === 'pf' ? (
                                <User className="h-3.5 w-3.5" />
                              ) : (
                                <Building2 className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <h4 className="text-base font-bold text-white truncate" title={lead.name}>
                              {lead.name}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {isB2CMode ? (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 border border-purple-500/40 px-2 py-0.5 text-[10px] font-bold text-purple-300 shadow-sm shadow-purple-500/10">
                                <Target className="h-3 w-3 text-purple-400" />
                                <span>🎯 Intenção de Compra Detectada</span>
                              </span>
                            ) : lead.entityType === 'pf' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                                <User className="h-3 w-3" />
                                <span>Pessoa Física (Consumidor)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                                <Building2 className="h-3 w-3" />
                                <span>Pessoa Jurídica (CNPJ)</span>
                              </span>
                            )}

                            {lead.category && (
                              <span className="inline-block text-[11px] font-medium text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-full">
                                {lead.category}
                              </span>
                            )}
                            {lead.demandTimeframe && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-cyan-950/40 border border-cyan-700/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                                <Clock className="h-3 w-3 text-cyan-400 shrink-0" />
                                <span>{lead.demandTimeframe}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {lead.rating && lead.rating > 0 && (
                          <div className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-xs font-bold text-amber-400 shrink-0">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span>{lead.rating}</span>
                          </div>
                        )}
                      </div>

                      {/* Info Box B2C */}
                      {isB2CMode && (
                        <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-950/20 p-2.5 space-y-1.5 text-xs">
                          <div className="flex items-start gap-1.5 text-purple-200">
                            <Target className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <span className="block text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                                Trecho da Menção Pública
                              </span>
                              <span className="text-purple-100 text-[11px] leading-relaxed">
                                {lead.decisionMaker || lead.trendingInsights?.[0] || 'Menção pública detectada'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Info Box B2B - Empresa / Decisor */}
                      {!isB2CMode && (lead.decisionMaker || lead.department || lead.company) && (
                        <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-950/30 p-2.5 space-y-1 text-xs">
                          {lead.company && (
                            <div className="flex items-start gap-1.5 text-zinc-200 mb-1">
                              <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="block text-[10px] uppercase font-bold text-zinc-400">Empresa / Razão Social</span>
                                <span className="font-semibold text-xs text-white">{lead.company}</span>
                              </div>
                            </div>
                          )}
                          {lead.decisionMaker && (
                            <div className="flex items-start gap-1.5 text-indigo-200">
                              <UserCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="block text-[10px] uppercase font-bold text-indigo-400">Comprador / Decisor</span>
                                <span className="font-semibold text-xs">{lead.decisionMaker}</span>
                              </div>
                            </div>
                          )}

                          {lead.department && (
                            <div className="flex items-start gap-1.5 text-zinc-300">
                              <Briefcase className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="block text-[10px] uppercase font-bold text-zinc-400">Setor / Departamento</span>
                                <span>{lead.department}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CNPJ & Legal Verification Badge */}
                      {!isB2CMode && (lead.cnpj || lead.legalSource) && (
                        <div className="mt-2.5 rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-2 text-[11px] flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-indigo-300 flex items-center gap-1 text-[10px] uppercase">
                              <ShieldCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                              Vínculo & Registro Oficial
                            </span>
                            {lead.cnpj && (
                              <span className="font-mono text-[10px] font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                                CNPJ: {lead.cnpj}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Phones */}
                      {hasDistinctLeadPhones ? (
                        <div className="mt-2.5 space-y-2">
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-400">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="block text-[9px] uppercase font-bold text-emerald-400 truncate">
                                  WhatsApp Direto
                                </span>
                                <span className="font-mono text-xs sm:text-sm font-bold text-emerald-300 truncate block">
                                  {decisionMakerPhone}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`https://wa.me/${cleanDecisionPhoneNum}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white transition flex items-center gap-1 shadow-sm"
                              >
                                <MessageSquare className="h-3 w-3" />
                                <span>Zap</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(decisionMakerPhone!, index)}
                                className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                              >
                                {copiedIndex === index ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span className="text-emerald-400">OK</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-cyan-500/10 text-cyan-400">
                                <Building2 className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="block text-[9px] uppercase font-bold text-cyan-400 truncate">
                                  Telefone Estabelecimento
                                </span>
                                <span className="font-mono text-xs sm:text-sm font-bold text-cyan-200 truncate block">
                                  {establishmentPhone}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`tel:${cleanEstPhoneNum}`}
                                className="rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition flex items-center gap-1"
                              >
                                <PhoneCall className="h-3 w-3 text-cyan-400" />
                                <span>Ligar</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      ) : lead.phone ? (
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Phone className="h-4 w-4 text-emerald-400 shrink-0" />
                            <div>
                              <span className="block text-[10px] uppercase font-bold text-emerald-500 tracking-wider">
                                Telefone / WhatsApp
                              </span>
                              <span className="font-mono text-sm sm:text-base font-bold text-emerald-300 truncate">
                                {lead.phone}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(lead.phone, index)}
                            className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white transition shrink-0"
                          >
                            {copiedIndex === index ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : null}

                      {/* Email */}
                      {lead.email && (
                        <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-950/20 p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="h-4 w-4 text-sky-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="block text-[9px] uppercase font-bold text-sky-400 tracking-wider">
                                E-mail Corporativo
                              </span>
                              <a
                                href={`mailto:${lead.email}`}
                                className="font-mono text-xs text-sky-200 hover:text-sky-100 hover:underline truncate block"
                              >
                                {lead.email}
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyEmail(lead.email!, index)}
                            className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 hover:text-white transition shrink-0"
                          >
                            {copiedEmailIndex === index ? (
                              <>
                                <Check className="h-3 w-3 text-sky-400" />
                                <span className="text-sky-400">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Location */}
                      <div className="mt-2.5 flex items-start gap-2 text-xs text-zinc-300 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
                        <MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="block text-[10px] uppercase font-bold text-zinc-500">
                            Localização / Fonte
                          </span>
                          <p className="text-xs text-zinc-200 line-clamp-2" title={lead.location}>
                            {lead.location}
                          </p>
                        </div>
                      </div>

                      {/* Pitch Recommendation (B2B) */}
                      {!isB2CMode && lead.pitchRecommendation && (
                        <div className="mt-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 p-2 text-xs text-indigo-200">
                          <span className="block text-[10px] uppercase font-bold text-indigo-400 mb-0.5 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Estratégia de Abordagem para Venda:
                          </span>
                          <p className="text-[11px] text-zinc-300 leading-relaxed">
                            {lead.pitchRecommendation}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Direct Links & Quick Sales Action */}
                    <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <a
                        href={lead.profileUrl || `https://www.google.com/search?q=${encodeURIComponent(`${lead.name} ${lead.location}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                        title="Abrir menção original"
                      >
                        <span>{isB2CMode ? 'Ver Menção Original' : 'Ver no Maps'}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      <div className="flex items-center gap-1.5">
                        {lead.phone && (
                          <a
                            href={`https://wa.me/${cleanPhoneNum}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {lead.phone && (
                          <a
                            href={hasDistinctLeadPhones ? `tel:${cleanEstPhoneNum}` : `tel:${cleanPhoneNum}`}
                            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
                          >
                            <PhoneCall className="h-3.5 w-3.5 text-indigo-400" />
                            <span>Ligar</span>
                          </a>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Continuous Harvesting */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5">
              <div className="text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">Safra #{currentPage}:</span> {extractedList.length} clientes reais captados (sem duplicidade).
              </div>

              <button
                type="button"
                onClick={handleFetchMoreLeads}
                disabled={isLoading || isLoadingMore}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 border border-indigo-500/50 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition cursor-pointer"
              >
                {isLoadingMore ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Prospectando Safra #{currentPage + 1}...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Buscar Mais Clientes Reais (Safra #{currentPage + 1})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  }
}
