import React, { useState } from 'react';
import { 
  Phone, 
  ExternalLink, 
  Copy, 
  Check, 
  MessageSquare, 
  PhoneCall, 
  Trash2, 
  Edit3, 
  MapPin,
  Building2,
  Briefcase,
  Calendar,
  Sparkles,
  TrendingUp,
  UserCheck,
  Tag,
  Flame,
  FileText,
  Mail,
  Clock,
  DollarSign,
  User,
  Globe,
  Truck,
  ArrowRight,
  Zap,
  ShieldAlert,
  Calculator,
  Tractor,
  Fuel,
  Instagram,
  ShieldCheck
} from 'lucide-react';
import type { Contact, ContactStatus } from '../types';
import { hasPurchaseIntent } from '../utils/purchaseIntent';
import { parseProductInsight, hasShippingIncluded } from '../utils/productHelper';
import { getOptimalContactTiming } from '../utils/salesScripts';
import { resolveWhatsAppNumber } from '../utils/phoneHelper';
import { WhatsAppPitchModal } from './WhatsAppPitchModal';
import { InstagramLogo } from './InstagramLogo';
import { resolveInstagram } from '../utils/instagramHelper';

export interface ContactCardProps {
  key?: React.Key;
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onStatusChange?: (contactId: string, newStatus: ContactStatus) => void;
}

export function ContactCard({
  contact,
  onEdit,
  onDelete,
  onStatusChange
}: ContactCardProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEstablishmentPhone, setCopiedEstablishmentPhone] = useState(false);
  const [copiedDecisionPhone, setCopiedDecisionPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedInstagram, setCopiedInstagram] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPitchModalOpen, setIsPitchModalOpen] = useState(false);

  const resolvedPhone = resolveWhatsAppNumber(contact);
  const establishmentPhone = resolvedPhone.establishmentPhone || contact.establishmentPhone || contact.phone;
  const decisionMakerPhone = resolvedPhone.displayPhone;
  const cleanDecision = resolvedPhone.cleanPhone;
  const cleanPhone = cleanDecision;
  const cleanEstablishment = establishmentPhone.replace(/\D/g, '');
  const cleanMainPhone = contact.phone.replace(/\D/g, '');
  const hasDistinctPhones = Boolean(decisionMakerPhone && establishmentPhone && decisionMakerPhone !== establishmentPhone);
  const timing = getOptimalContactTiming(contact.category, contact.entityType);

  // 🆕 Indicador de WhatsApp vindo da API (Apify)
  const temWhatsapp = (contact as any).tem_whatsapp;

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCopyEstablishment = () => {
    navigator.clipboard.writeText(establishmentPhone);
    setCopiedEstablishmentPhone(true);
    setTimeout(() => setCopiedEstablishmentPhone(false), 2000);
  };

  const handleCopyDecision = () => {
    if (!decisionMakerPhone) return;
    navigator.clipboard.writeText(decisionMakerPhone);
    setCopiedDecisionPhone(true);
    setTimeout(() => setCopiedDecisionPhone(false), 2000);
  };

  const handleCopyEmail = () => {
    if (!contact.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const insta = resolveInstagram(contact);

  const handleCopyInstagram = () => {
    navigator.clipboard.writeText(insta.handle);
    setCopiedInstagram(true);
    setTimeout(() => setCopiedInstagram(false), 2000);
  };

  const handleDelete = async () => {
    if (!contact.id) return;
    if (window.confirm(`Deseja excluir o contato "${contact.name}"?`)) {
      setIsDeleting(true);
      try {
        await onDelete(contact.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const getStatusBadge = (status: ContactStatus) => {
    switch (status) {
      case 'new':
        return <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400 border border-blue-500/20">Novo Lead</span>;
      case 'contacted':
        return <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">Contatado</span>;
      case 'meeting':
        return <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-400 border border-purple-500/20">Reunião</span>;
      case 'qualified':
        return <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">Qualificado</span>;
      case 'unreachable':
        return <span className="rounded-full bg-zinc-700/30 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 border border-zinc-700">Sem retorno</span>;
      default:
        return <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">Novo</span>;
    }
  };

  const formattedDate = new Date(contact.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  return (
    <div className="group relative rounded-xl border border-zinc-800/90 bg-zinc-900/60 p-5 shadow-lg backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/90 flex flex-col justify-between">
      
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                contact.entityType === 'pf' 
                  ? 'bg-purple-500/15 text-purple-400' 
                  : 'bg-blue-500/15 text-blue-400'
              }`}>
                {contact.entityType === 'pf' ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Building2 className="h-3 w-3" />
                )}
              </span>
              <h3 className="text-base font-bold text-white truncate" title={contact.name}>
                {contact.name}
              </h3>
              {getStatusBadge(contact.status)}
            </div>

            {/* Category / Sector & Need Alert Badge */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {(contact.category?.toLowerCase().includes('rural') || 
                contact.category?.toLowerCase().includes('cana') || 
                contact.category?.toLowerCase().includes('fazenda') ||
                contact.category?.toLowerCase().includes('canavieir') ||
                contact.company?.toLowerCase().includes('fazenda') ||
                contact.name.toLowerCase().includes('fazenda') ||
                contact.name.toLowerCase().includes('estância') ||
                contact.decisionMaker?.toLowerCase().includes('produtor')) ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-sm shadow-emerald-500/10">
                  <Tractor className="h-3 w-3 text-emerald-400" />
                  <span>Produtor Rural / Fazenda</span>
                </span>
              ) : (
                contact.category?.toLowerCase().includes('posto') || 
                contact.category?.toLowerCase().includes('combust') || 
                contact.company?.toLowerCase().includes('posto') ||
                contact.name.toLowerCase().includes('posto') ||
                (contact.decisionMaker?.toLowerCase().includes('compras') && (contact.department?.toLowerCase().includes('combust') || contact.category?.toLowerCase().includes('combust')))
              ) ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm shadow-amber-500/10">
                  <Fuel className="h-3 w-3 text-amber-400" />
                  <span>Posto de Combustível</span>
                </span>
              ) : contact.entityType === 'pf' ? (
                <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                  <User className="h-3 w-3" />
                  <span>Pessoa Física</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                  <Building2 className="h-3 w-3" />
                  <span>Pessoa Jurídica</span>
                </span>
              )}

              {contact.category && (
                <span className="inline-block text-[11px] font-medium text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/40 truncate">
                  {contact.category}
                </span>
              )}
              {contact.demandTimeframe && (
                <span className="inline-flex items-center gap-1 rounded-md bg-cyan-950/40 border border-cyan-700/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                  <Clock className="h-3 w-3 text-cyan-400 shrink-0" />
                  <span>{contact.demandTimeframe}</span>
                </span>
              )}
              {hasPurchaseIntent(contact.notes) && (
                <span 
                  className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border border-orange-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm shadow-orange-500/10"
                  title="Alerta de Necessidade: Intenção de compra detectada no campo de observação"
                >
                  <Flame className="h-3 w-3 text-orange-400 fill-orange-400 animate-pulse shrink-0" />
                  <span>Alerta de Necessidade</span>
                </span>
              )}
            </div>
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(contact)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
              title="Editar contato"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 transition"
              title="Excluir contato"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Specialized Rural Farm & Producer Box or Decision Maker Badge */}
        {(contact.category?.toLowerCase().includes('rural') || 
          contact.category?.toLowerCase().includes('cana') || 
          contact.category?.toLowerCase().includes('fazenda') ||
          contact.category?.toLowerCase().includes('canavieir') ||
          contact.company?.toLowerCase().includes('fazenda') ||
          contact.name.toLowerCase().includes('fazenda') ||
          contact.name.toLowerCase().includes('estância') ||
          contact.decisionMaker?.toLowerCase().includes('produtor')) ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 space-y-2 text-xs">
            <div className="flex items-start gap-1.5 text-emerald-200">
              <Tractor className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  Nome da Fazenda / Propriedade Rural
                </span>
                <span className="font-bold text-white text-xs">
                  {contact.company || (contact.name.includes('-') ? contact.name.split('-')[0].trim() : contact.name)}
                </span>
              </div>
            </div>

            {contact.decisionMaker && (
              <div className="flex items-start gap-1.5 text-indigo-200">
                <UserCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                    Nome do Produtor Rural / Titular
                  </span>
                  <span className="font-semibold text-xs text-indigo-100">{contact.decisionMaker}</span>
                </div>
              </div>
            )}

            {contact.department && (
              <div className="flex items-start gap-1.5 text-zinc-300">
                <Briefcase className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    Capacidade Produtiva, Safra & Destino
                  </span>
                  <span className="text-zinc-200">{contact.department}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          contact.category?.toLowerCase().includes('posto') || 
          contact.category?.toLowerCase().includes('combust') || 
          contact.company?.toLowerCase().includes('posto') ||
          contact.name.toLowerCase().includes('posto') ||
          (contact.decisionMaker?.toLowerCase().includes('compras') && (contact.department?.toLowerCase().includes('combust') || contact.category?.toLowerCase().includes('combust')))
        ) ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-2 text-xs">
            <div className="flex items-start gap-1.5 text-amber-200">
              <Fuel className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                  Posto & Rede de Abastecimento
                </span>
                <span className="font-bold text-white text-xs">
                  {contact.company || contact.name}
                </span>
              </div>
            </div>

            {contact.decisionMaker && (
              <div className="flex items-start gap-1.5 text-orange-200">
                <UserCheck className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-orange-400 tracking-wider">
                    Gerente de Compras & Suprimentos
                  </span>
                  <span className="font-semibold text-xs text-orange-100">{contact.decisionMaker}</span>
                </div>
              </div>
            )}

            {contact.department && (
              <div className="flex items-start gap-1.5 text-zinc-300">
                <Briefcase className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    Setor & Especialidade de Compras
                  </span>
                  <span className="text-zinc-200">{contact.department}</span>
                </div>
              </div>
            )}
          </div>
        ) : (contact.decisionMaker || contact.department || contact.company) ? (
          <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-950/30 p-2.5 space-y-1.5 text-xs">
            {contact.company && (
              <div className="flex items-start gap-1.5 text-zinc-200 mb-1">
                <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400">Empresa / Razão Social</span>
                  <span className="font-semibold text-xs text-white">{contact.company}</span>
                </div>
              </div>
            )}
            {contact.decisionMaker && (
              <div className="flex items-start gap-1.5 text-indigo-200">
                <UserCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-indigo-400">Comprador / Decisor</span>
                  <span className="font-semibold">{contact.decisionMaker}</span>
                </div>
              </div>
            )}

            {contact.department && (
              <div className="flex items-start gap-1.5 text-zinc-300">
                <Briefcase className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400">Setor / Departamento</span>
                  <span>{contact.department}</span>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* CNPJ & Legal Verification Badge */}
        {(contact.cnpj || contact.legalSource || contact.entityType === 'pj') && (
          <div className="mt-2.5 rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-2 text-[11px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold text-indigo-300 flex items-center gap-1 text-[10px] uppercase">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                Vínculo & Registro Oficial (OSINT)
              </span>
              {contact.cnpj && (
                <span className="font-mono text-[10px] font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                  CNPJ: {contact.cnpj}
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-400 leading-tight">
              {contact.legalSource || 'Origem: Contrato Social / Junta Comercial / Registro em Cartório e QSA Receita Federal'}
            </p>
            <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-indigo-500/20 text-[9px]">
              <span className="text-zinc-500 text-[9px] font-medium mr-0.5">Fontes:</span>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`"${contact.company || contact.name}" "${contact.location || ''}" CNPJ Receita Federal QSA`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-zinc-900 border border-indigo-500/40 px-1.5 py-0.5 text-indigo-300 hover:text-white hover:bg-indigo-900/40 transition"
                title="Consultar Quadro de Sócios (QSA) e CNPJ na Receita Federal"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Receita / QSA
              </a>
              <a
                href={`https://www.jusbrasil.com.br/busca?q=${encodeURIComponent(`"${contact.company || contact.name}"`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-zinc-900 border border-zinc-700/60 px-1.5 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                title="Pesquisar processos públicos e jurisprudência no Jusbrasil"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Jusbrasil
              </a>
              <a
                href={`https://portaldatransparencia.gov.br/busca?termo=${encodeURIComponent(`"${contact.company || contact.name}"`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-zinc-900 border border-zinc-700/60 px-1.5 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                title="Pesquisar contratos e licitações públicas no Portal da Transparência"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Licitações
              </a>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`"${contact.company || contact.name}" "diario oficial" OR "DOU" OR "DOM"`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-zinc-900 border border-zinc-700/60 px-1.5 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                title="Buscar menções em Diários Oficiais (União, Estado ou Município)"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Diário Oficial
              </a>
              <a
                href={`https://www.escavador.com/busca?q=${encodeURIComponent(`"${contact.company || contact.name}"`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-zinc-900 border border-zinc-700/60 px-1.5 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                title="Pesquisar registros no Escavador"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Escavador
              </a>
            </div>
          </div>
        )}

        {/* Extracted Phone Sections (Dual: Establishment + Decision Maker / Partner) */}
        {hasDistinctPhones ? (
          <div className="mt-2.5 space-y-2">
            {/* Number 1: Decision Maker / Buyer / Partner WhatsApp */}
            <div className={`rounded-lg border p-2.5 flex items-center justify-between gap-2 ${
              temWhatsapp === true
                ? 'border-emerald-500/50 bg-emerald-950/30'
                : temWhatsapp === false
                  ? 'border-zinc-700/60 bg-zinc-900/40'
                  : 'border-emerald-500/30 bg-emerald-950/20'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                  temWhatsapp === true
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : temWhatsapp === false
                      ? 'bg-zinc-700/40 text-zinc-500'
                      : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="block text-[9px] uppercase font-bold text-emerald-400 truncate">
                      WhatsApp Direto ({contact.decisionMaker || 'Gerente de Compras & Suprimentos / Sócio'})
                    </span>
                    {temWhatsapp === true && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/25 border border-emerald-400/60 px-1.5 py-0.2 text-[8px] font-bold text-emerald-200 shadow-sm shadow-emerald-500/20">
                        <Check className="h-2.5 w-2.5 text-emerald-300" />
                        ATIVO
                      </span>
                    )}
                    {temWhatsapp === false && (
                      <span className="inline-flex items-center gap-1 rounded bg-zinc-700/40 border border-zinc-600/60 px-1.5 py-0.2 text-[8px] font-bold text-zinc-400">
                        SEM WHATSAPP
                      </span>
                    )}
                  </div>
                  <span className={`font-mono text-sm font-bold truncate block ${
                    temWhatsapp === true ? 'text-emerald-300' : temWhatsapp === false ? 'text-zinc-400' : 'text-emerald-300'
                  }`}>
                    {decisionMakerPhone}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`https://wa.me/${cleanDecision}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded px-2 py-1 text-[11px] font-semibold text-white transition flex items-center gap-1 shadow-sm ${
                    temWhatsapp === false
                      ? 'bg-zinc-700 hover:bg-zinc-600'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                  title={temWhatsapp === false ? 'Número sem WhatsApp - tentar mesmo assim' : 'Abrir WhatsApp direto do Decisor'}
                >
                  <MessageSquare className="h-3 w-3" />
                  <span>Zap</span>
                </a>
                <button
                  onClick={handleCopyDecision}
                  className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                  title="Copiar WhatsApp do Decisor"
                >
                  {copiedDecisionPhone ? (
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

            {/* Number 2: Establishment Phone (Fixed / PABX) */}
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-cyan-500/10 text-cyan-400">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[9px] uppercase font-bold text-cyan-400 truncate">
                    Telefone do Estabelecimento (Fixo / Central PABX)
                  </span>
                  <span className="font-mono text-sm font-bold text-cyan-200 truncate block">
                    {establishmentPhone}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`tel:${cleanEstablishment}`}
                  className="rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition flex items-center gap-1"
                  title="Ligar para o estabelecimento"
                >
                  <PhoneCall className="h-3 w-3 text-cyan-400" />
                  <span>Ligar</span>
                </a>
                <button
                  onClick={handleCopyEstablishment}
                  className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                  title="Copiar telefone do estabelecimento"
                >
                  {copiedEstablishmentPhone ? (
                    <>
                      <Check className="h-3 w-3 text-cyan-400" />
                      <span className="text-cyan-400">OK</span>
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
          </div>
        ) : (
          <div className={`mt-3 rounded-lg border p-3 flex items-center justify-between gap-2 ${
            temWhatsapp === true
              ? 'border-emerald-500/50 bg-emerald-950/30'
              : temWhatsapp === false
                ? 'border-zinc-700/60 bg-zinc-900/40'
                : 'border-emerald-500/30 bg-emerald-950/20'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                temWhatsapp === true
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : temWhatsapp === false
                    ? 'bg-zinc-700/40 text-zinc-500'
                    : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                <Phone className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="block text-[10px] uppercase font-bold text-emerald-500">Telefone / WhatsApp</span>
                  {temWhatsapp === true && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/25 border border-emerald-400/60 px-1.5 py-0.2 text-[8px] font-bold text-emerald-200 shadow-sm shadow-emerald-500/20">
                      <Check className="h-2.5 w-2.5 text-emerald-300" />
                      ATIVO
                    </span>
                  )}
                  {temWhatsapp === false && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-700/40 border border-zinc-600/60 px-1.5 py-0.2 text-[8px] font-bold text-zinc-400">
                      SEM WHATSAPP
                    </span>
                  )}
                </div>
                <span className={`font-mono text-sm font-bold truncate ${
                  temWhatsapp === true ? 'text-emerald-300' : temWhatsapp === false ? 'text-zinc-400' : 'text-emerald-300'
                }`}>
                  {contact.phone}
                </span>
              </div>
            </div>

            <button
              onClick={handleCopyPhone}
              className="flex shrink-0 items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
              title="Copiar telefone"
            >
              {copiedPhone ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
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

        {/* Extracted Email Section */}
        {contact.email && (
          <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-950/20 p-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-sky-500/10 text-sky-400">
                <Mail className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] uppercase font-bold text-sky-400">E-mail Corporativo</span>
                <a 
                  href={`mailto:${contact.email}`} 
                  className="font-mono text-xs text-sky-200 hover:text-sky-100 hover:underline truncate block"
                  title={contact.email}
                >
                  {contact.email}
                </a>
              </div>
            </div>

            <button
              onClick={handleCopyEmail}
              className="flex shrink-0 items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
              title="Copiar e-mail"
            >
              {copiedEmail ? (
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

        {/* Instagram Oficial com Logotipo Vetorial Autêntico */}
        <div className={`mt-2.5 rounded-lg border ${
          insta.isVerifiedBrand 
            ? 'border-pink-500/50 bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-zinc-900/60 shadow-sm shadow-pink-500/10'
            : 'border-pink-500/30 bg-gradient-to-r from-pink-950/25 via-purple-950/20 to-zinc-900/40'
        } p-2.5 flex items-center justify-between gap-2.5`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <InstagramLogo size={24} className="shrink-0 rounded-md shadow-sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] uppercase font-bold text-pink-400 tracking-wider">
                  Instagram
                </span>
                {insta.isVerifiedBrand ? (
                  <span className="inline-flex items-center gap-1 rounded bg-pink-500/20 border border-pink-400/40 px-1.5 py-0.2 text-[8px] font-bold text-pink-300">
                    <Check className="h-2.5 w-2.5 text-pink-400" />
                    OFICIAL VERIFICADO
                  </span>
                ) : (
                  <span className="text-[8px] font-medium text-zinc-400">
                    ({contact.entityType === 'pf' ? 'Perfil Pessoal' : 'Perfil Comercial'})
                  </span>
                )}
              </div>
              <a 
                href={insta.url} 
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs font-bold text-pink-200 hover:text-white hover:underline truncate block"
                title={`Abrir perfil do Instagram: ${insta.url}`}
              >
                {insta.handle}
              </a>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={insta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-pink-950/60 border border-pink-700/50 hover:border-pink-400 px-2 py-1 text-[10px] font-medium text-pink-200 hover:text-white transition shadow-sm"
              title="Acessar página no Instagram"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Abrir</span>
            </a>
            <button
              onClick={handleCopyInstagram}
              className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:text-white transition cursor-pointer"
              title="Copiar Instagram"
            >
              {copiedInstagram ? (
                <>
                  <Check className="h-3 w-3 text-pink-400" />
                  <span className="text-pink-400">Copiado</span>
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

        {/* Location Section */}
        {contact.location && (
          <div className="mt-2.5 flex items-start gap-2 text-xs text-zinc-300 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60">
            <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase font-bold text-zinc-500">Localização Maps</span>
              <p className="text-xs text-zinc-300 line-clamp-2" title={contact.location}>
                {contact.location}
              </p>
            </div>
          </div>
        )}

        {/* Trending Insights / Products in Demand */}
        {contact.trendingInsights && contact.trendingInsights.length > 0 && (
          <div className="mt-2.5 rounded-lg bg-zinc-950/80 p-2.5 border border-amber-500/20">
            <span className="block text-[10px] uppercase font-bold text-amber-400 flex items-center justify-between gap-1 mb-2">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-amber-400" />
                Produtos Buscados para Compra (Recentes)
              </span>
              <span className="text-[9px] font-normal text-amber-400/80">
                Produto + Site de Destino
              </span>
            </span>
            <div className="space-y-1.5">
              {contact.trendingInsights.slice(0, 3).map((item, idx) => {
                const parsed = parseProductInsight(item);
                return (
                  <div 
                    key={idx} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded bg-zinc-900/90 border border-zinc-800/80 px-2 py-1.5 text-[11px]"
                  >
                    <span className="font-medium text-zinc-200 truncate" title={parsed.productName}>
                      {parsed.productName}
                    </span>
                    {parsed.destinationSite && (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-950/60 border border-indigo-700/40 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300 shrink-0 self-start sm:self-auto">
                        <Globe className="h-2.5 w-2.5 text-indigo-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{parsed.destinationSite}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Competitor Prices / Benchmark */}
        {contact.competitorPrices && (
          <div className="mt-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 p-2.5 text-xs text-emerald-200">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="block text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-emerald-400" />
                Preços de Concorrentes & Margens
              </span>
              {hasShippingIncluded(contact.competitorPrices) && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                  <Truck className="h-2.5 w-2.5 text-emerald-400" />
                  Frete Incluso
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              {contact.competitorPrices}
            </p>
          </div>
        )}

        {/* Pitch Recommendation / Strategic Angle */}
        {contact.pitchRecommendation && (
          <div className="mt-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 p-2.5 text-xs text-indigo-200">
            <span className="block text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1 mb-0.5">
              <Sparkles className="h-3 w-3 text-indigo-300" />
              Estratégia de Abordagem para Venda
            </span>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              {contact.pitchRecommendation}
            </p>
          </div>
        )}

        {/* Observation / Notes & Intent */}
        {contact.notes && (
          <div className={`mt-2.5 rounded-lg p-2.5 text-xs border ${
            hasPurchaseIntent(contact.notes)
              ? 'bg-amber-950/20 border-amber-500/30'
              : 'bg-zinc-950/40 border-zinc-800/80'
          }`}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="block text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <FileText className="h-3 w-3 text-zinc-400" />
                Observação / Intenção
              </span>
              {hasPurchaseIntent(contact.notes) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                  <Flame className="h-3 w-3 text-orange-400 fill-orange-400 animate-pulse" />
                  Alerta Ativo
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-300 line-clamp-3 leading-relaxed">
              {contact.notes}
            </p>
          </div>
        )}

        {/* Optimal Timing Bar for Sales */}
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1.5 text-[10px]">
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3 w-3 text-amber-400" />
            <span>Melhor Horário:</span>
            <strong className="text-zinc-200">{timing.timeWindow}</strong>
          </div>
          <span className={`font-semibold px-1.5 py-0.2 rounded text-[9px] ${
            timing.urgencyLevel === 'alta' 
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
          }`}>
            {timing.urgencyLevel === 'alta' ? '🔥 Alta Urgência' : '⚡ Janela Semanal'}
          </span>
        </div>

        {/* Profile / Maps Link */}
        {(() => {
          const mapUrl = contact.profileUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${contact.name}, ${contact.location}`)}`;
          return (
            <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
              <span className="truncate max-w-[180px] text-zinc-500 font-mono text-[11px]">
                {mapUrl}
              </span>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition shrink-0"
              >
                <span>{contact.platform === 'google_maps' ? 'Ver no Maps' : 'Abrir Link'}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          );
        })()}
      </div>

      {/* Action Footer for Sales */}
      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col gap-2">
        
        {/* Main High-Performance Sales Button */}
        <button
          onClick={() => setIsPitchModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition transform active:scale-[0.98]"
        >
          <Zap className="h-4 w-4 fill-white" />
          <span>⚡ Scripts WhatsApp & Fechamento</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Calendar className="h-3 w-3" />
            <span>{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
              title="Abrir WhatsApp direto"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>WhatsApp Direto</span>
            </a>
            <a
              href={`tel:${cleanPhone}`}
              className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
              title="Fazer ligação"
            >
              <PhoneCall className="h-3.5 w-3.5 text-indigo-400" />
              <span>Ligar</span>
            </a>
          </div>
        </div>
      </div>

      {/* Render Sales Pitch Modal */}
      {isPitchModalOpen && (
        <WhatsAppPitchModal
          contact={contact}
          isOpen={isPitchModalOpen}
          onClose={() => setIsPitchModalOpen(false)}
          onStatusUpdated={onStatusChange}
          onContactUpdated={onEdit}
        />
      )}

    </div>
  );
}
