import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  MessageSquare, 
  Copy, 
  Check, 
  Zap, 
  DollarSign, 
  UserCheck, 
  Clock, 
  Sparkles, 
  Calculator,
  ShieldAlert,
  Building2,
  PhoneCall,
  ArrowRight,
  Send,
  Edit3,
  Maximize2,
  Minimize2,
  ExternalLink,
  ShieldCheck,
  Search,
  Truck,
  Warehouse,
  TrendingUp,
  Filter,
  Layers,
  RotateCw,
  Globe,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Save,
  Landmark,
  Scale,
  Briefcase,
  Receipt,
  Share2
} from 'lucide-react';
import type { Contact } from '../types';
import { getSalesScriptsForContact, OBJECTION_HANDBOOK, getOptimalContactTiming, SalesScriptOption } from '../utils/salesScripts';
import { parseProductInsight } from '../utils/productHelper';
import { resolveWhatsAppNumber, buildWhatsAppUrl, formatBrazilianPhone, consultMultiSourcePhone } from '../utils/phoneHelper';

interface WhatsAppPitchModalProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: (contactId: string, status: any) => void;
  onContactUpdated?: (updatedContact: Contact) => void;
}

export function WhatsAppPitchModal({
  contact,
  isOpen,
  onClose,
  onStatusUpdated,
  onContactUpdated
}: WhatsAppPitchModalProps) {
  const [sellerName, setSellerName] = useState(() => {
    return localStorage.getItem('blitz360_seller_name') || 'Consultor Comercial';
  });

  // State to control expanded / full window size as requested by user
  const [isMaximized, setIsMaximized] = useState(true);

  // Resolve authentic Brazilian phone numbers prioritizing the Gerente de Compras & Suprimentos
  const resolvedPhone = useMemo(() => resolveWhatsAppNumber(contact), [contact]);

  // Multi-Source Public Phone Investigation State (Cartório, Redes, DOU, Licitações, Vagas, NF-e)
  const [isInvestigatingPhone, setIsInvestigatingPhone] = useState(false);
  const [investigationResult, setInvestigationResult] = useState<any>(null);
  const [investigationError, setInvestigationError] = useState<string | null>(null);
  const [investigationSuccess, setInvestigationSuccess] = useState<boolean>(false);
  const [showDeepSources, setShowDeepSources] = useState(false);
  const [verifiedPhoneOverride, setVerifiedPhoneOverride] = useState<string | null>(null);
  const [verifiedLegalSource, setVerifiedLegalSource] = useState<string | null>(null);
  const [verifiedSourcesFound, setVerifiedSourcesFound] = useState<string[]>([]);
  const [investigationStep, setInvestigationStep] = useState<string>('');

  // Target phone state (allows operator to verify or fine-tune)
  const [targetPhoneType, setTargetPhoneType] = useState<'decisionMaker' | 'establishment'>('decisionMaker');
  const [customPhoneInput, setCustomPhoneInput] = useState<string>(resolvedPhone.displayPhone);
  const [isEditingPhone, setIsEditingPhone] = useState(false);

  const scripts = useMemo(() => getSalesScriptsForContact(contact, sellerName), [contact, sellerName]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>(scripts[0]?.id || 'urgency_delivery');
  const [customText, setCustomText] = useState<string>(() => {
    return scripts[0]?.generateText(contact, sellerName) || '';
  });

  const [activeTab, setActiveTab] = useState<'scripts' | 'calculator' | 'objections'>('scripts');
  const [copied, setCopied] = useState(false);
  const [copiedObjectionId, setCopiedObjectionId] = useState<string | null>(null);

  // Objections Search and Filter State (25+ objections)
  const [objectionSearch, setObjectionSearch] = useState('');
  const [objectionCategory, setObjectionCategory] = useState<string>('all');

  // Proposal Calculator State (FOB vs CIF)
  const [calcCost, setCalcCost] = useState<number>(0);
  const [calcShipping, setCalcShipping] = useState<number>(0);
  const [calcMarginPercent, setCalcMarginPercent] = useState<number>(25);
  const [calcQty, setCalcQty] = useState<number>(100);
  const [shippingProposalMode, setShippingProposalMode] = useState<'CIF' | 'FOB' | 'COMPARATIVE'>('CIF');
  const [proposalCopied, setProposalCopied] = useState(false);

  // Active target phone for dispatch
  const activeDisplayPhone = isEditingPhone && customPhoneInput
    ? customPhoneInput
    : (verifiedPhoneOverride
        ? verifiedPhoneOverride
        : (targetPhoneType === 'establishment'
            ? resolvedPhone.establishmentPhone
            : resolvedPhone.displayPhone));

  const activeCleanPhone = activeDisplayPhone.replace(/\D/g, '');

  const activeLegalSource = verifiedLegalSource || contact.legalSource || resolvedPhone.legalSource || 'Cadastro Comercial / Diário Oficial';

  const handleInvestigatePhone = async () => {
    setIsInvestigatingPhone(true);
    setInvestigationError(null);
    setInvestigationSuccess(false);
    setInvestigationStep('Cruzando Cartórios, Diários Oficiais, Licitações e Redes Sociais...');

    try {
      const result = await consultMultiSourcePhone(contact);
      setInvestigationResult(result);

      if (result && result.phone) {
        setVerifiedPhoneOverride(result.phone);
        setCustomPhoneInput(result.phone);
        if (result.source) {
          setVerifiedLegalSource(result.source);
        }
        if (result.sourcesFound && Array.isArray(result.sourcesFound)) {
          setVerifiedSourcesFound(result.sourcesFound);
        }
        setInvestigationSuccess(true);
        if (onContactUpdated) {
          onContactUpdated({
            ...contact,
            phone: result.phone,
            establishmentPhone: result.establishmentPhone || result.phone,
            whatsapp: result.whatsapp || result.phone,
            decisionMakerPhone: result.decisionMakerPhone || result.phone,
            legalSource: result.source || contact.legalSource,
          });
        }
      } else {
        setInvestigationError('Consulta realizada. Nenhuma linha pública alternativa localizada. Utilize as 7 consultas diretas abaixo ou digite o número.');
      }
    } catch (err: any) {
      setInvestigationError('Erro na consulta: ' + (err.message || 'Falha de conexão'));
    } finally {
      setIsInvestigatingPhone(false);
      setInvestigationStep('');
    }
  };

  const handleSaveManualPhone = () => {
    if (!customPhoneInput) return;
    const clean = customPhoneInput.trim();
    setVerifiedPhoneOverride(clean);
    setIsEditingPhone(false);
    if (onContactUpdated) {
      onContactUpdated({
        ...contact,
        phone: clean,
        whatsapp: clean,
        decisionMakerPhone: clean,
        legalSource: 'Telefone ajustado e confirmado pelo operador',
      });
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const timing = getOptimalContactTiming(contact.category, contact.entityType);
  const productInfo = contact.trendingInsights && contact.trendingInsights.length > 0 
    ? parseProductInsight(contact.trendingInsights[0]) 
    : { productName: contact.category || 'Combustíveis e Insumos', destinationSite: '' };

  const handleSelectScript = (script: SalesScriptOption) => {
    setSelectedScriptId(script.id);
    setCustomText(script.generateText(contact, sellerName));
  };

  const handleSellerNameChange = (name: string) => {
    setSellerName(name);
    try {
      localStorage.setItem('blitz360_seller_name', name);
    } catch (e) {
      console.error(e);
    }
    const current = scripts.find(s => s.id === selectedScriptId);
    if (current) {
      setCustomText(current.generateText(contact, name));
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(customText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const url = buildWhatsAppUrl(activeCleanPhone, customText);
    window.open(url, '_blank');
    if (contact.id && onStatusUpdated && contact.status === 'new') {
      onStatusUpdated(contact.id, 'contacted');
    }
  };

  // --- CALCULADORA FOB vs CIF ---
  const costUnit = Number(calcCost) || 0;
  const shippingUnit = Number(calcShipping) || 0;
  const qty = Number(calcQty) > 0 ? Number(calcQty) : 1;
  const margin = Number(calcMarginPercent) || 0;

  // 1. Modalidade FOB (Retirada na base / frete do cliente)
  const unitSalesFOB = margin < 100 && margin >= 0
    ? costUnit / (1 - margin / 100)
    : costUnit * 1.3;
  const totalFOB = unitSalesFOB * qty;
  const totalProfitFOB = (unitSalesFOB - costUnit) * qty;

  // 2. Modalidade CIF (Entregue com frete incluso)
  const costWithFreightUnit = costUnit + shippingUnit;
  const unitSalesCIF = margin < 100 && margin >= 0
    ? costWithFreightUnit / (1 - margin / 100)
    : costWithFreightUnit * 1.3;
  const totalCIF = unitSalesCIF * qty;
  const totalFreight = shippingUnit * qty;
  const totalProfitCIF = (unitSalesCIF - costWithFreightUnit) * qty;

  // Mensagem formatada da proposta de acordo com a modalidade selecionada
  const formattedProposalMessage = useMemo(() => {
    const compName = contact.company || contact.name;
    const dest = contact.location || 'seu estabelecimento';

    if (shippingProposalMode === 'CIF') {
      return `*PROPOSTA COMERCIAL (MODALIDADE CIF - FRETE INCLUSO)* 📦🚚\n\n` +
        `Olá, *${contact.name}*! Tudo bem? Aqui é o ${sellerName}.\n` +
        `Segue nossa cotação especial com entrega direta na sua empresa:\n\n` +
        `🏢 *Destinatário:* ${compName} (${dest})\n` +
        `📦 *Produto:* ${productInfo.productName}\n` +
        `🔢 *Volume / Quantidade:* ${qty} un\n` +
        `🚚 *Modalidade:* *CIF (Frete e Seguro 100% Inclusos na Porta)*\n` +
        `💵 *Preço Unitário CIF:* R$ ${unitSalesCIF.toFixed(2)}\n` +
        `💰 *Valor Total do Pedido:* R$ ${totalCIF.toFixed(2)}\n\n` +
        `✅ Carga 100% segurada com rastreamento de transporte\n` +
        `✅ Emissão imediata de Nota Fiscal e laudo de conformidade\n` +
        `💳 *Condições:* PIX com desconto adicional ou Boleto Faturado PJ (mediante cadastro rápido)\n\n` +
        `Podemos reservar esse lote para entrega programada?`;
    }

    if (shippingProposalMode === 'FOB') {
      return `*PROPOSTA COMERCIAL (MODALIDADE FOB - RETIRADA NA BASE)* 🏭📦\n\n` +
        `Olá, *${contact.name}*! Tudo bem? Aqui é o ${sellerName}.\n` +
        `Segue nossa cotação especial para retirada na base pelo comprador:\n\n` +
        `🏢 *Empresa:* ${compName}\n` +
        `📦 *Produto:* ${productInfo.productName}\n` +
        `🔢 *Volume / Quantidade:* ${qty} un\n` +
        `🏭 *Modalidade:* *FOB (Retirada por conta do comprador)*\n` +
        `💵 *Preço Unitário FOB:* R$ ${unitSalesFOB.toFixed(2)}\n` +
        `💰 *Valor Total do Lote:* R$ ${totalFOB.toFixed(2)}\n\n` +
        `✅ Mercadoria disponível para carregamento imediato\n` +
        `✅ Nota Fiscal com laudo técnico oficial\n` +
        `💳 *Condições:* PIX ou Boleto Faturado PJ\n\n` +
        `Qual transportadora ou veículo costuma coletar para vocês?`;
    }

    // Modalidade COMPARATIVE
    return `*COTAÇÃO COMPARATIVA - BLITZ 360 (FOB vs CIF)* 📊\n\n` +
      `Olá, *${contact.name}*! Tudo bem? Aqui é o ${sellerName}.\n` +
      `Preparamos as duas opções de fornecimento para a *${compName}*:\n\n` +
      `📦 *Produto:* ${productInfo.productName} | *Qtd:* ${qty} un\n\n` +
      `1️⃣ *OPÇÃO CIF (Entrega no seu endereço com frete incluso):*\n` +
      `• Valor Unitário: *R$ ${unitSalesCIF.toFixed(2)}*\n` +
      `• Total Entregue: *R$ ${totalCIF.toFixed(2)}* (Frete de R$ ${totalFreight.toFixed(2)} já incluso)\n` +
      `• Vantagem: Carga segurada até a porta, sem custo adicional de frete.\n\n` +
      `2️⃣ *OPÇÃO FOB (Retirada na base com transportadora do cliente):*\n` +
      `• Valor Unitário: *R$ ${unitSalesFOB.toFixed(2)}*\n` +
      `• Total na Base: *R$ ${totalFOB.toFixed(2)}*\n` +
      `• Vantagem: Máxima economia se você já possui frota ou contrato próprio de transporte.\n\n` +
      `Qual das duas modalidades é mais vantajosa para o seu planejamento hoje?`;
  }, [shippingProposalMode, contact, sellerName, productInfo, qty, unitSalesCIF, totalCIF, totalFreight, unitSalesFOB, totalFOB]);

  const handleCopyProposal = () => {
    navigator.clipboard.writeText(formattedProposalMessage);
    setProposalCopied(true);
    setTimeout(() => setProposalCopied(false), 2000);
  };

  const handleOpenWhatsAppWithProposal = () => {
    const url = buildWhatsAppUrl(activeCleanPhone, formattedProposalMessage);
    window.open(url, '_blank');
    if (contact.id && onStatusUpdated && contact.status === 'new') {
      onStatusUpdated(contact.id, 'contacted');
    }
  };

  // Filtered objections list (25+ objections)
  const filteredObjections = useMemo(() => {
    return OBJECTION_HANDBOOK.filter((obj) => {
      const matchesCategory = objectionCategory === 'all' || obj.category === objectionCategory;
      const matchesSearch = !objectionSearch || 
        obj.objection.toLowerCase().includes(objectionSearch.toLowerCase()) ||
        obj.solutionSummary.toLowerCase().includes(objectionSearch.toLowerCase()) ||
        obj.scriptResponse.toLowerCase().includes(objectionSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [objectionCategory, objectionSearch]);

  const handleDirectObjectionWhatsApp = (responseScript: string) => {
    const url = buildWhatsAppUrl(activeCleanPhone, responseScript);
    window.open(url, '_blank');
    if (contact.id && onStatusUpdated && contact.status === 'new') {
      onStatusUpdated(contact.id, 'contacted');
    }
  };

  // Render via React Portal to document.body to ensure it NEVER gets trapped inside a card or table cell!
  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Modal Window Container */}
      <div className={`relative ${
        isMaximized 
          ? 'w-[98vw] max-w-[1700px] h-[95vh] max-h-[98vh]' 
          : 'w-[92vw] max-w-5xl h-[88vh]'
      } flex flex-col rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl overflow-hidden text-zinc-100 transition-all duration-200`}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3.5 bg-zinc-950/95 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Central de Scripts WhatsApp, Abordagem & Fechamento Comercial
                </h2>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 shadow-sm flex items-center gap-1">
                  <Zap className="h-3 w-3 fill-emerald-400" />
                  Disparo Direto Válido
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                Empresa: <strong className="text-zinc-200">{contact.company || contact.name}</strong> • Decisor: <strong className="text-emerald-300">{resolvedPhone.decisionMakerRole} ({contact.decisionMaker || contact.name})</strong> • {contact.location}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Maximize/Minimize Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="flex items-center gap-1.5 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition border border-zinc-700 text-xs font-semibold"
              title={isMaximized ? "Restaurar janela menor" : "Maximizar janela em tela cheia"}
            >
              {isMaximized ? (
                <>
                  <Minimize2 className="h-4 w-4 text-zinc-300" />
                  <span className="hidden sm:inline">Restaurar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4 text-emerald-400" />
                  <span className="hidden sm:inline">Maximizar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              title="Fechar Janela"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Channel & Target Switcher Subheader */}
        <div className="border-b border-zinc-800/80 px-6 py-2.5 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400 font-medium">Canal de Envio WhatsApp:</span>
            
            <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setTargetPhoneType('decisionMaker');
                  setCustomPhoneInput(activeDisplayPhone);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                  targetPhoneType === 'decisionMaker'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>WhatsApp Decisor ({activeDisplayPhone})</span>
                {(resolvedPhone.isVerifiedReal || verifiedPhoneOverride) && (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1 rounded border border-emerald-400/40">
                    Oficial
                  </span>
                )}
              </button>

              {resolvedPhone.establishmentPhone && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetPhoneType('establishment');
                    setCustomPhoneInput(resolvedPhone.establishmentPhone || '');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                    targetPhoneType === 'establishment'
                      ? 'bg-cyan-700 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Central Estabelecimento ({resolvedPhone.establishmentPhone})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsEditingPhone(!isEditingPhone)}
                className={`p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition ${
                  isEditingPhone ? 'text-emerald-400 bg-zinc-800' : ''
                }`}
                title="Editar número manualmente"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {isEditingPhone && (
              <div className="flex items-center gap-1.5 animate-in fade-in">
                <input
                  type="text"
                  value={customPhoneInput}
                  onChange={(e) => setCustomPhoneInput(e.target.value)}
                  placeholder="+55 (34) 9XXXX-XXXX"
                  className="bg-zinc-900 border border-emerald-500 rounded-lg px-2.5 py-1 text-xs text-emerald-300 font-mono focus:outline-none w-44"
                />
                <button
                  type="button"
                  onClick={handleSaveManualPhone}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Salvar e aplicar ao WhatsApp"
                >
                  <Save className="h-3 w-3" />
                  <span>Salvar</span>
                </button>
              </div>
            )}

            {/* Quick Action Link for Phone Call and Google Verification */}
            <div className="flex items-center gap-1.5">
              <a
                href={resolvedPhone.callUrl}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] font-medium transition"
                title="Efetuar ligação telefônica direta"
              >
                <PhoneCall className="h-3 w-3 text-indigo-400" />
                <span>Ligar</span>
              </a>

              <a
                href={resolvedPhone.searchUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-300 border border-zinc-700 text-[11px] font-medium transition"
                title="Verificar registro no Google / Receita"
              >
                <ExternalLink className="h-3 w-3 text-cyan-400" />
                <span>Checar Registro</span>
              </a>
            </div>
          </div>

          {/* Seller Name & Contact Timing */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-amber-300 bg-amber-950/30 border border-amber-500/30 px-2.5 py-1 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Horário Ideal:</strong> {timing.timeWindow} ({timing.bestDay})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400">Assinatura:</span>
              <input
                type="text"
                value={sellerName}
                onChange={(e) => handleSellerNameChange(e.target.value)}
                placeholder="Consultor Comercial"
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none w-36"
              />
            </div>
          </div>

        </div>

        {/* Multi-Source Public Investigation & Phone Intelligence Bar */}
        <div className="border-b border-zinc-800 bg-zinc-950/95 px-6 py-2.5 flex flex-col gap-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-zinc-300">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Auditoria Multi-Fontes de Contato Real:</span>
              </span>

              {/* Status Badge */}
              {resolvedPhone.isVerifiedReal || verifiedPhoneOverride ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span>Validado em Base Pública Oficial</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  <span>Linha Provisória • 7 Fontes Públicas Disponíveis</span>
                </span>
              )}

              {/* Legal Source Tag */}
              <span className="text-[11px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-xs" title={activeLegalSource}>
                Fonte: <strong className="text-zinc-300">{activeLegalSource}</strong>
              </span>
            </div>

            {/* Actions: Automated Scanner & Public Source Links Toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleInvestigatePhone}
                disabled={isInvestigatingPhone}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-md shadow-indigo-600/20 disabled:opacity-60 cursor-pointer"
                title="Cruzar dados em Cartórios, Diários Oficiais, Licitações, Redes e Vagas"
              >
                {isInvestigatingPhone ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin text-white" />
                    <span>Auditando 7 Fontes Públicas...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5 text-indigo-200" />
                    <span>Investigar Telefone Real</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDeepSources(!showDeepSources)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  showDeepSources
                    ? 'bg-zinc-800 text-cyan-300 border-cyan-500/40'
                    : 'bg-zinc-900 text-zinc-300 hover:text-white border-zinc-700'
                }`}
                title="Exibir atalhos diretos para Diários Oficiais, Cartório, Licitações, Vagas e Redes"
              >
                <Globe className="h-3.5 w-3.5 text-cyan-400" />
                <span>Consultas Oficiais (7 Fontes)</span>
                {showDeepSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Real-time scanner message or error */}
          {investigationStep && (
            <div className="flex items-center gap-2 text-[11px] text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 rounded-lg px-3 py-1.5 animate-pulse">
              <RotateCw className="h-3 w-3 animate-spin" />
              <span>{investigationStep}</span>
            </div>
          )}

          {investigationSuccess && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span><strong>Telefone Oficial Localizado:</strong> {activeDisplayPhone} ({activeLegalSource})</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Atualizado no WhatsApp</span>
            </div>
          )}

          {investigationError && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>{investigationError}</span>
              </span>
            </div>
          )}

          {/* Expandable 7 Public Sources Links */}
          {showDeepSources && (
            <div className="mt-1 pt-2 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <a
                href={resolvedPhone.deepSearchLinks.cartorio}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar Contrato Social / Junta Comercial (JUCESP/JUCEMG) e Cartório"
              >
                <Landmark className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="truncate font-medium">Cartório & Contrato</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.diarioOficial}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar Diário Oficial da União (DOU), Estadual (DOE) e Municipal (DOM)"
              >
                <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="truncate font-medium">Diário Oficial (DOU/DOE)</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.licitacoes}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar Editais, Comprasnet e PNCP Licitações"
              >
                <Scale className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-medium">Licitações & PNCP</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.vagasEmprego}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar vagas de emprego em Catho, Vagas.com, Gupy e LinkedIn"
              >
                <Briefcase className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="truncate font-medium">Vagas & Empregos</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.redesSociais}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar Instagram Bio, LinkedIn da Empresa/Decisor e Facebook"
              >
                <Share2 className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                <span className="truncate font-medium">Redes Sociais</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.notaFiscalSintegra}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Consultar Notas Fiscais e Sintegra / Sefaz"
              >
                <Receipt className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                <span className="truncate font-medium">NF-e & Sintegra</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>

              <a
                href={resolvedPhone.deepSearchLinks.googleBuscaGeral}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition"
                title="Busca Geral no Google por Telefone e WhatsApp Comercial"
              >
                <Search className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="truncate font-medium">Busca Ampla</span>
                <ExternalLink className="h-2.5 w-2.5 ml-auto text-zinc-500" />
              </a>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 bg-zinc-900/90 shrink-0">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'scripts'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-800/30'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>1. Scripts Estratégicos & Abordagem</span>
            <span className="text-[10px] bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
              5 Modelos
            </span>
          </button>

          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'calculator'
                ? 'border-indigo-500 text-indigo-400 bg-zinc-800/30'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Calculator className="h-4 w-4" />
            <span>2. Cálculo de Frete, Margens & Venda FOB vs CIF</span>
            <span className="text-[10px] bg-indigo-950/80 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
              Simulador
            </span>
          </button>

          <button
            onClick={() => setActiveTab('objections')}
            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'objections'
                ? 'border-amber-500 text-amber-400 bg-zinc-800/30'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>3. Quebras de Objeções (Rejeição de Clientes)</span>
            <span className="text-[10px] bg-amber-950/80 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">
              25 Prontas
            </span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: SCRIPTS ESTRATÉGICOS & ABORDAGEM */}
          {activeTab === 'scripts' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Script Selectors */}
              <div className="lg:col-span-5 space-y-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Selecione o Gatilho Comercial:
                </span>

                <div className="space-y-2.5">
                  {scripts.map((script) => {
                    const isSelected = selectedScriptId === script.id;
                    return (
                      <button
                        key={script.id}
                        type="button"
                        onClick={() => handleSelectScript(script)}
                        className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500/80 text-white shadow-lg shadow-emerald-950/40'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${isSelected ? 'text-emerald-400' : 'text-zinc-200'}`}>
                            {script.title}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            isSelected 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                              : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {script.badge}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {script.preview}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Intelligence Insights Summary */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs space-y-2 mt-4">
                  <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    Inteligência de Mercado Aplicada:
                  </span>
                  <p className="text-zinc-300 leading-relaxed">
                    <strong>Produto em alta:</strong> {productInfo.productName}
                  </p>
                  {contact.competitorPrices && (
                    <p className="text-zinc-400">
                      <strong>Referência Concorrentes:</strong> {contact.competitorPrices}
                    </p>
                  )}
                  {contact.demandTimeframe && (
                    <p className="text-amber-400/90">
                      <strong>Janela de Reposição:</strong> {contact.demandTimeframe}
                    </p>
                  )}
                </div>

              </div>

              {/* Right Column: Message Editor & Dispatch Bar */}
              <div className="lg:col-span-7 flex flex-col space-y-4">
                
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                    <Edit3 className="h-3.5 w-3.5 text-emerald-400" />
                    Mensagem Pronta para o Decisor (Você pode personalizar livremente):
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    {customText.length} caracteres
                  </span>
                </div>

                <div className="relative flex-1 flex flex-col">
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    rows={12}
                    className="w-full flex-1 min-h-[300px] rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-xs sm:text-sm text-zinc-100 font-sans leading-relaxed focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                    placeholder="Escreva ou refine a mensagem para o decisor..."
                  />
                </div>

                {/* Dispatch Bar */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-2.5 text-xs flex-wrap">
                    <span className="text-zinc-400 font-medium">Destinatário:</span>
                    <strong className="text-emerald-400 font-mono text-sm tracking-wide">
                      {activeDisplayPhone}
                    </strong>
                    <span className="text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                      <UserCheck className="h-3 w-3 text-emerald-400" />
                      {resolvedPhone.decisionMakerRole}
                    </span>
                    {resolvedPhone.isVerifiedReal && (
                      <span className="text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3 text-emerald-400" />
                        Cadastro Oficial Auditado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <a
                      href={resolvedPhone.callUrl}
                      className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-3.5 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                      title="Ligar diretamente pelo discador"
                    >
                      <PhoneCall className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Ligar</span>
                    </a>

                    <button
                      onClick={handleCopyText}
                      className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Copiar Texto</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleOpenWhatsApp}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
                    >
                      <Send className="h-4 w-4 fill-white" />
                      <span>Abrir & Enviar no WhatsApp ({activeDisplayPhone})</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: CÁLCULO DE FRETE, MARGENS & VENDA FOB vs CIF */}
          {activeTab === 'calculator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Cost, Freight & Mode Inputs */}
              <div className="lg:col-span-5 space-y-4 bg-zinc-950/80 p-5 rounded-xl border border-zinc-800">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Simulador Comercial: Frete, Venda FOB vs CIF
                  </h3>
                </div>

                {/* Shipping Mode Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-zinc-300">
                    Modalidade da Proposta a Enviar:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setShippingProposalMode('CIF')}
                      className={`p-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        shippingProposalMode === 'CIF'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Truck className="h-4 w-4" />
                      <span>CIF (Frete Incluso)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShippingProposalMode('FOB')}
                      className={`p-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        shippingProposalMode === 'FOB'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Warehouse className="h-4 w-4" />
                      <span>FOB (Retirada)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShippingProposalMode('COMPARATIVE')}
                      className={`p-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        shippingProposalMode === 'COMPARATIVE'
                          ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Layers className="h-4 w-4" />
                      <span>Comparativo Ambos</span>
                    </button>
                  </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-3.5 text-xs pt-2">
                  <div>
                    <label className="block text-xs text-zinc-300 font-medium mb-1">
                      Custo Unitário de Aquisição / Fornecedor (R$):
                    </label>
                    <input
                      type="number"
                      value={calcCost || ''}
                      onChange={(e) => setCalcCost(parseFloat(e.target.value) || 0)}
                      placeholder="Ex: 4.80"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-300 font-medium mb-1">
                      Custo do Frete Unitário para a Região (R$):
                    </label>
                    <input
                      type="number"
                      value={calcShipping || ''}
                      onChange={(e) => setCalcShipping(parseFloat(e.target.value) || 0)}
                      placeholder="Ex: 0.35"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                      No modal FOB este frete não é cobrado na proposta; no modal CIF ele é incorporado.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-300 font-medium mb-1">
                        Margem de Lucro (%):
                      </label>
                      <input
                        type="number"
                        value={calcMarginPercent || ''}
                        onChange={(e) => setCalcMarginPercent(parseFloat(e.target.value) || 0)}
                        placeholder="25"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-300 font-medium mb-1">
                        Volume / Quantidade:
                      </label>
                      <input
                        type="number"
                        value={calcQty || ''}
                        onChange={(e) => setCalcQty(parseInt(e.target.value) || 1)}
                        placeholder="100"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Real-time Calculation Comparison Cards */}
                <div className="pt-3 border-t border-zinc-800 space-y-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span className="flex items-center gap-1 font-semibold text-indigo-300">
                        <Warehouse className="h-3.5 w-3.5" />
                        Venda Unitária FOB (Retirada):
                      </span>
                      <strong className="text-indigo-400 text-sm font-mono">
                        R$ {unitSalesFOB.toFixed(2)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mt-1">
                      <span>Total FOB ({qty} un):</span>
                      <strong className="text-white font-mono">R$ {totalFOB.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span className="flex items-center gap-1 font-semibold text-emerald-300">
                        <Truck className="h-3.5 w-3.5" />
                        Venda Unitária CIF (Com Frete):
                      </span>
                      <strong className="text-emerald-400 text-sm font-mono">
                        R$ {unitSalesCIF.toFixed(2)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mt-1">
                      <span>Total CIF Entregue ({qty} un):</span>
                      <strong className="text-white font-mono">R$ {totalCIF.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mt-0.5">
                      <span>Frete Total Embutido:</span>
                      <span className="text-zinc-300 font-mono">R$ {totalFreight.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-zinc-400 pt-1">
                    <span>Lucro Bruto Estimado ({shippingProposalMode}):</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      R$ {(shippingProposalMode === 'FOB' ? totalProfitFOB : totalProfitCIF).toFixed(2)}
                    </strong>
                  </div>
                </div>

              </div>

              {/* Right Column: Formatted Proposal Preview for WhatsApp */}
              <div className="lg:col-span-7 flex flex-col space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 block">
                    Orçamento Comercial Formatado para Envio via WhatsApp:
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-emerald-500/30">
                    Modalidade Atual: {shippingProposalMode}
                  </span>
                </div>

                <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-xs font-mono whitespace-pre-wrap text-zinc-200 leading-relaxed shadow-inner min-h-[340px]">
                  {formattedProposalMessage}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyProposal}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                  >
                    {proposalCopied ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Orçamento Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copiar Orçamento</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomText(formattedProposalMessage);
                        setActiveTab('scripts');
                      }}
                      className="px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
                      title="Editar este orçamento no editor de scripts"
                    >
                      Editar no Script
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenWhatsAppWithProposal}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
                    >
                      <Send className="h-4 w-4 fill-white" />
                      <span>Enviar Orçamento no WhatsApp ({activeDisplayPhone})</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: RESPOSTAS PRONTAS PARA REJEIÇÃO MAIS COMUM (25 RESPOSTAS) */}
          {activeTab === 'objections' && (
            <div className="space-y-4">
              
              {/* Header Box */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0" />
                  <span>
                    <strong>Manual Tático de Quebra de Objeções:</strong> Mais de 20 respostas prontas e comprovadas para contornar qualquer rejeição de clientes no WhatsApp ou telefone.
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-900/60 px-2.5 py-1 rounded-lg border border-amber-500/40">
                  {filteredObjections.length} de {OBJECTION_HANDBOOK.length} Objeções Disponíveis
                </span>
              </div>

              {/* Search & Category Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={objectionSearch}
                    onChange={(e) => setObjectionSearch(e.target.value)}
                    placeholder="Buscar objeção por palavra-chave (ex: frete, boleto, preço, sócio)..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                  />
                  {objectionSearch && (
                    <button
                      onClick={() => setObjectionSearch('')}
                      className="absolute right-2.5 top-2 text-zinc-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'Todas (25)' },
                    { id: 'preco', label: 'Preço & Margem' },
                    { id: 'frete', label: 'Frete & Logística' },
                    { id: 'prazo', label: 'Prazo & Boleto' },
                    { id: 'fornecedor', label: 'Fornecedor' },
                    { id: 'confianca', label: 'Confiança & Laudos' },
                    { id: 'timing', label: 'Timing & Estoque' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setObjectionCategory(cat.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        objectionCategory === cat.id
                          ? 'bg-amber-600 text-white font-bold shadow-sm'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

              </div>

              {/* Objections Grid (25 Items) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredObjections.map((obj) => (
                  <div 
                    key={obj.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3 flex flex-col justify-between hover:border-zinc-700 transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-rose-300 leading-snug">
                          {obj.objection}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 border border-zinc-700">
                          {obj.category}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-400 italic">
                        💡 <strong>Tática:</strong> {obj.solutionSummary}
                      </p>

                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 leading-relaxed font-sans select-text">
                        "{obj.scriptResponse}"
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-900 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(obj.scriptResponse);
                          setCopiedObjectionId(obj.id);
                          setTimeout(() => setCopiedObjectionId(null), 2000);
                        }}
                        className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 py-2 text-xs font-semibold text-zinc-300 transition"
                      >
                        {copiedObjectionId === obj.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar Resposta</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomText(obj.scriptResponse);
                          setActiveTab('scripts');
                        }}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition"
                        title="Carregar no editor de WhatsApp da aba 1"
                      >
                        Usar no Editor
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDirectObjectionWhatsApp(obj.scriptResponse)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition shadow-sm"
                        title="Enviar diretamente ao WhatsApp do decisor"
                      >
                        <Send className="h-3.5 w-3.5 fill-white" />
                        <span>Enviar</span>
                      </button>
                    </div>
                  </div>
                ))}

                {filteredObjections.length === 0 && (
                  <div className="col-span-2 p-8 text-center text-zinc-500 text-xs">
                    Nenhuma objeção encontrada para o termo "{objectionSearch}". Tente buscar por preço, frete, prazo ou fornecedor.
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-3 bg-zinc-950/95 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Canal WhatsApp Blitz 360 • Conectado à Rede de Decisores ({resolvedPhone.decisionMakerRole})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition border border-zinc-800"
          >
            Fechar Janela
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
