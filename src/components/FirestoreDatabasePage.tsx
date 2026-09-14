import React, { useState, useMemo } from 'react';
import { 
  Database, 
  ArrowLeft, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  Trash2, 
  CheckCircle2, 
  Filter, 
  RotateCw, 
  Sparkles,
  Search,
  Building2,
  PhoneCall,
  Check
} from 'lucide-react';
import type { Contact, ContactStatus } from '../types';
import { ContactTableView } from './ContactTableView';
import { auditContactList } from '../utils/contactVeracityAuditor';

interface FirestoreDatabasePageProps {
  contacts: Contact[];
  onBackToProspecting: () => void;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onBatchDeleteContacts: (contactIds: string[]) => Promise<void>;
  onStatusChange: (contactId: string, newStatus: ContactStatus) => void;
  onShowToast: (text: string, type?: 'success' | 'error') => void;
}

export function FirestoreDatabasePage({
  contacts,
  onBackToProspecting,
  onEditContact,
  onDeleteContact,
  onBatchDeleteContacts,
  onStatusChange,
  onShowToast
}: FirestoreDatabasePageProps) {
  const [onlyVerified, setOnlyVerified] = useState(true);
  const [isDeletingUnverified, setIsDeletingUnverified] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);

  // Computa a auditoria de veracidade de todos os contatos
  const auditSummary = useMemo(() => {
    return auditContactList(contacts);
  }, [contacts]);

  // Contatos a serem exibidos na tabela
  const displayedContacts = useMemo(() => {
    if (onlyVerified) {
      return auditSummary.realContacts;
    }
    return contacts;
  }, [onlyVerified, auditSummary, contacts]);

  // Exclusão em lote de contatos sem veracidade
  const handleExecuteDeleteUnverified = async () => {
    if (auditSummary.unverifiedIds.length === 0) return;
    setIsDeletingUnverified(true);
    try {
      await onBatchDeleteContacts(auditSummary.unverifiedIds);
      setShowConfirmDeleteModal(false);
      onShowToast(`Auditoria concluída! ${auditSummary.unverifiedIds.length} contatos sem veracidade foram excluídos do Firestore.`, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(`Erro ao excluir contatos: ${err.message || 'Tente novamente.'}`, 'error');
    } finally {
      setIsDeletingUnverified(false);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(`${window.location.origin}${window.location.pathname}#banco-firestore`, '_blank');
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToProspecting}
            className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white transition shadow-sm cursor-pointer"
            title="Voltar para a tela de busca e levantamento limpa"
          >
            <ArrowLeft className="h-4 w-4 text-indigo-400" />
            <span>Voltar para Prospecção</span>
          </button>

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Database className="h-6 w-6 text-indigo-400" />
              <span>Total no Banco Salvos no Firestore</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Base permanente com comprovação de existência pública (Cartórios, Juntas Comerciais, Receita Federal e Sintegra).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            title="Abrir esta página do banco em uma nova aba do navegador"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Abrir em Nova Aba</span>
          </button>
        </div>
      </div>

      {/* Auditoria de Veracidade & Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Total Geral no Banco */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Total Armazenado</span>
            <Database className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {auditSummary.total}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Registros no Cloud Firestore</p>
        </div>

        {/* Card 2: Contatos com Veracidade Comprovada */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span className="font-semibold">Comprovados & Reais</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300">
            {auditSummary.realCount}
          </div>
          <p className="text-[11px] text-emerald-500 mt-1">Telefone ativo + existência verificada</p>
        </div>

        {/* Card 3: Sem Veracidade / Fictícios */}
        <div className={`rounded-xl border p-4 backdrop-blur-sm ${
          auditSummary.unverifiedCount > 0 
            ? 'border-amber-500/40 bg-amber-950/20' 
            : 'border-zinc-800 bg-zinc-900/60'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={auditSummary.unverifiedCount > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-400'}>
              Sem Veracidade / Fictícios
            </span>
            <AlertTriangle className={`h-4 w-4 ${auditSummary.unverifiedCount > 0 ? 'text-amber-400' : 'text-zinc-500'}`} />
          </div>
          <div className={`text-2xl font-extrabold ${auditSummary.unverifiedCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
            {auditSummary.unverifiedCount}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Telefones inválidos ou sem registro</p>
        </div>

      </div>

      {/* Banner de Auditoria e Limpeza de Contatos Inválidos */}
      {auditSummary.unverifiedCount > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-zinc-900/80 to-zinc-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-300">
                Revisão da Base: {auditSummary.unverifiedCount} contatos sem veracidade detectados
              </h3>
              <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed max-w-2xl">
                Identificamos números de telefone fictícios, formatos com DDD inexistente ou registros sem comprovação pública. Deseja apagá-los do Firestore para manter apenas os contatos 100% reais?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfirmDeleteModal(true)}
              disabled={isDeletingUnverified}
              className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Apagar {auditSummary.unverifiedCount} Contatos Sem Veracidade</span>
            </button>
          </div>
        </div>
      )}

      {/* Barra de Filtro de Veracidade */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer select-none font-medium">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500/30"
            />
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Exibir apenas contatos reais e comprovados de existência ({auditSummary.realCount})</span>
            </span>
          </label>
        </div>

        <div className="text-xs text-zinc-400">
          Exibindo <strong className="text-white">{displayedContacts.length}</strong> de {auditSummary.total} contatos
        </div>
      </div>

      {/* Tabela de Contatos */}
      <ContactTableView
        contacts={displayedContacts}
        onEdit={onEditContact}
        onDelete={onDeleteContact}
        onStatusChange={onStatusChange}
      />

      {/* Modal de Confirmação de Exclusão em Lote */}
      {showConfirmDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Confirmar Exclusão de Contatos</h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Você está prestes a excluir definitivamente <strong>{auditSummary.unverifiedCount} contatos</strong> que não possuem veracidade comprovada (telefones inválidos ou fictícios) do seu banco no Cloud Firestore.
            </p>

            <p className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 p-2.5 rounded-lg">
              Os <strong>{auditSummary.realCount} contatos reais</strong> serão mantidos e preservados com segurança.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDeleteModal(false)}
                disabled={isDeletingUnverified}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteUnverified}
                disabled={isDeletingUnverified}
                className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                {isDeletingUnverified ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Excluindo do Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirmar e Apagar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
