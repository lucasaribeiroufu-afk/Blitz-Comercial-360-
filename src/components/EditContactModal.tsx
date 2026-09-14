import React, { useState, useEffect } from 'react';
import { X, Save, User, MapPin, UserCheck, Briefcase, Sparkles, Flame, FileText, Mail, DollarSign, Clock, Building2, Users, Instagram, Check } from 'lucide-react';
import type { Contact, ContactStatus, EntityType } from '../types';
import { hasPurchaseIntent } from '../utils/purchaseIntent';
import { findVerifiedSocialRecord } from '../utils/socialKnowledgeBase';

interface EditContactModalProps {
  isOpen: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSave: (contactId: string, updatedData: Partial<Contact>) => Promise<void>;
}

export function EditContactModal({
  isOpen,
  contact,
  onClose,
  onSave,
}: EditContactModalProps) {
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('pj');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [decisionMaker, setDecisionMaker] = useState('');
  const [demandTimeframe, setDemandTimeframe] = useState('');
  const [competitorPrices, setCompetitorPrices] = useState('');
  const [pitchRecommendation, setPitchRecommendation] = useState('');
  const [trendingInsightsText, setTrendingInsightsText] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<ContactStatus>('new');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setEntityType(contact.entityType || 'pj');
      setPhone(contact.phone || '');
      setEmail(contact.email || '');
      setInstagram(contact.instagram || '');
      setLocation(contact.location || '');
      setCategory(contact.category || '');
      setDepartment(contact.department || '');
      setDecisionMaker(contact.decisionMaker || '');
      setDemandTimeframe(contact.demandTimeframe || '');
      setCompetitorPrices(contact.competitorPrices || '');
      setPitchRecommendation(contact.pitchRecommendation || '');
      setTrendingInsightsText(contact.trendingInsights ? contact.trendingInsights.join(', ') : '');
      setProfileUrl(contact.profileUrl || '');
      setCompany(contact.company || '');
      setRole(contact.role || '');
      setStatus(contact.status || 'new');
      setNotes(contact.notes || '');
      setError(null);
    }
  }, [contact, isOpen]);

  if (!isOpen || !contact) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do contato é obrigatório.');
      return;
    }
    if (!phone.trim()) {
      setError('O telefone é obrigatório.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const parsedInsights = trendingInsightsText
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    try {
      await onSave(contact.id!, {
        name: name.trim(),
        entityType,
        phone: phone.trim(),
        email: email.trim() || undefined,
        instagram: instagram.trim() || undefined,
        location: location.trim(),
        category: category.trim(),
        department: department.trim(),
        decisionMaker: decisionMaker.trim(),
        demandTimeframe: demandTimeframe.trim() || undefined,
        competitorPrices: competitorPrices.trim() || undefined,
        pitchRecommendation: pitchRecommendation.trim(),
        trendingInsights: parsedInsights.length > 0 ? parsedInsights : undefined,
        profileUrl: profileUrl.trim(),
        company: company.trim(),
        role: role.trim(),
        status,
        notes: notes.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar alterações');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Editar Contato & Inteligência</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Tipo de Perfil / Lead (PF vs PJ) */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1.5">Tipo de Perfil / Cliente</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntityType('pf')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold transition ${
                  entityType === 'pf'
                    ? 'border-purple-500/60 bg-purple-950/40 text-purple-200 shadow-sm shadow-purple-500/10'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <User className="h-4 w-4 text-purple-400" />
                <span>Pessoa Física (PF/Consumidor)</span>
              </button>
              <button
                type="button"
                onClick={() => setEntityType('pj')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold transition ${
                  entityType === 'pj'
                    ? 'border-blue-500/60 bg-blue-950/40 text-blue-200 shadow-sm shadow-blue-500/10'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Building2 className="h-4 w-4 text-blue-400" />
                <span>Pessoa Jurídica (PJ/Empresa)</span>
              </button>
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              {entityType === 'pf' ? 'Nome da Pessoa / Comprador *' : 'Nome da Empresa / Razão Social *'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-100 text-sm focus:border-indigo-500 focus:outline-none"
              required
            />
          </div>

          {/* Decisor / Comprador */}
          <div>
            <label className="block font-medium text-indigo-300 mb-1 flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
              <span>Nome do Comprador / Decisor</span>
            </label>
            <input
              type="text"
              value={decisionMaker}
              onChange={(e) => setDecisionMaker(e.target.value)}
              placeholder="Ex: Carlos Eduardo Silveira - Gerente de Compras"
              className="w-full rounded-lg border border-indigo-500/40 bg-zinc-950 p-2.5 text-zinc-100 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Setor / Departamento */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1 flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5 text-zinc-400" />
              <span>Setor / Departamento</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Ex: Setor de Suprimentos & Compras Industriais"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Telefone, Email & Instagram em Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Telefone / WhatsApp *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-emerald-300 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-medium text-sky-300 mb-1 flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 text-sky-400" />
                <span>E-mail</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="compras@empresa.com.br"
                className="w-full rounded-lg border border-sky-500/40 bg-zinc-950 p-2.5 text-sky-200 font-mono text-xs focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-pink-300 flex items-center gap-1">
                  <Instagram className="h-3.5 w-3.5 text-pink-400" />
                  <span>Instagram Oficial</span>
                </label>
                {(() => {
                  const verified = findVerifiedSocialRecord(name, company, category);
                  if (verified && verified.instagram !== instagram) {
                    return (
                      <button
                        type="button"
                        onClick={() => setInstagram(verified.instagram)}
                        className="text-[10px] text-pink-400 hover:text-pink-300 underline font-medium"
                        title={`Usar perfil verificado oficial: ${verified.instagram}`}
                      >
                        Sugerir {verified.instagram}
                      </button>
                    );
                  }
                  if (verified && verified.instagram === instagram) {
                    return (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-pink-400 bg-pink-500/15 px-1 rounded border border-pink-400/30">
                        <Check className="h-2.5 w-2.5" />
                        Verificado
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@perfil ou link oficial"
                className="w-full rounded-lg border border-pink-500/40 bg-zinc-950 p-2.5 text-pink-200 font-mono text-xs focus:border-pink-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Localização Maps */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-rose-400" />
              <span>Localização Maps (Endereço, Bairro, Cidade - UF)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Fazenda São Martinho - Pradópolis - SP"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Categoria & Janela de Demanda (Recência) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Categoria / Nicho</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Usinas de Açúcar e Álcool"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-cyan-300 mb-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                <span>Recência / Janela (últimos 7 dias)</span>
              </label>
              <input
                type="text"
                value={demandTimeframe}
                onChange={(e) => setDemandTimeframe(e.target.value)}
                placeholder="Ex: Últimas 24h, Últimos 7 dias..."
                className="w-full rounded-lg border border-cyan-700/50 bg-zinc-950 p-2.5 text-cyan-200 text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Itens Buscados Recentemente para Compra */}
          <div>
            <label className="block font-medium text-amber-300 mb-1 flex items-center gap-1">
              <span>🛒 Produtos Buscados para Compra (Recentes)</span>
            </label>
            <textarea
              rows={2}
              value={trendingInsightsText}
              onChange={(e) => setTrendingInsightsText(e.target.value)}
              placeholder="Ex: Clarificante de Caldo de Cana, Floculantes, Rolamentos (separe por vírgula)"
              className="w-full rounded-lg border border-amber-500/30 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Separe os itens ou produtos por vírgula para exibi-los como tags na tabela, cards e exportação.
            </span>
          </div>

          {/* Preços de Concorrentes & Margens */}
          <div>
            <label className="block font-medium text-emerald-300 mb-1 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span>Preços de Concorrentes & Referência</span>
            </label>
            <textarea
              rows={2}
              value={competitorPrices}
              onChange={(e) => setCompetitorPrices(e.target.value)}
              placeholder="Ex: Concorrentes praticam R$ 42,00 a R$ 48,00 / kg. Margem favorável para oferta até R$ 39,50."
              className="w-full rounded-lg border border-emerald-500/30 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Estratégia de Abordagem para Venda / Pitch */}
          <div>
            <label className="block font-medium text-indigo-300 mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-400" />
              <span>Estratégia de Abordagem para Venda</span>
            </label>
            <textarea
              rows={2}
              value={pitchRecommendation}
              onChange={(e) => setPitchRecommendation(e.target.value)}
              placeholder="Ex: Abordar destacando pronta-entrega e condição especial de teste..."
              className="w-full rounded-lg border border-indigo-500/30 bg-zinc-950 p-2.5 text-zinc-200 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Link do Perfil ou Google Maps */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">Link do Google Maps / Website</label>
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-200 text-xs font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Pipeline Status */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">Status no Funil de Vendas</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ContactStatus)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="new">Novo Lead</option>
              <option value="contacted">Contatado (WhatsApp / Ligação)</option>
              <option value="meeting">Reunião Agendada</option>
              <option value="qualified">Qualificado / Oportunidade</option>
              <option value="unreachable">Sem Retorno / Descartado</option>
            </select>
          </div>

          {/* Anotações / Observações */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-medium text-zinc-300 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                <span>Observação & Intenção de Compra</span>
              </label>
              {hasPurchaseIntent(notes) && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <Flame className="h-3 w-3 text-orange-400 fill-orange-400 animate-pulse" />
                  Alerta de Necessidade Ativo
                </span>
              )}
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Comprador buscando cotação urgente de clarificante para usinas..."
              className={`w-full rounded-lg bg-zinc-950 p-2.5 text-zinc-200 focus:outline-none transition ${
                hasPurchaseIntent(notes)
                  ? 'border border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20'
                  : 'border border-zinc-700 focus:border-indigo-500'
              }`}
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
