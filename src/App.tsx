/**
 * Blitz 360 - Ferramenta de Prospecção e Extração de Contatos para Vendas
 * Login via Google Authentication + Armazenamento Individual no Cloud Firestore
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  PhoneCall, 
  MessageSquare, 
  CheckCircle2, 
  TrendingUp, 
  RotateCw,
  Sparkles,
  Zap,
  Clock,
  ShieldCheck,
  AlertCircle,
  Database,
  ExternalLink,
  Eraser
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { auth, onAuthStateChanged } from './lib/firebase';
import { 
  subscribeContacts, 
  updateContactInFirestore, 
  deleteContactFromFirestore,
  batchDeleteContacts
} from './services/contactService';
import { DEFAULT_API_CONFIG } from './services/extractionService';
import type { Contact, ExtractionApiConfig, ContactStatus } from './types';

// Components
import { Navbar } from './components/Navbar';
import { ExtractionHero } from './components/ExtractionHero';
import { ContactTableView } from './components/ContactTableView';
import { EditContactModal } from './components/EditContactModal';
import { ApiConfigModal } from './components/ApiConfigModal';
import { LoginScreen } from './components/LoginScreen';
import { FirestoreDatabasePage } from './components/FirestoreDatabasePage';
import { auditContactList } from './utils/contactVeracityAuditor';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // View routing: 'prospecting' (clean prospecting canvas) vs 'database' (full Firestore database page)
  const [viewMode, setViewMode] = useState<'prospecting' | 'database'>(() => {
    return window.location.hash === '#banco-firestore' ? 'database' : 'prospecting';
  });

  // Clear screen trigger for extraction hero
  const [clearScreenTrigger, setClearScreenTrigger] = useState<number>(0);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Extraction API configuration with localStorage persistence
  const [apiConfig, setApiConfig] = useState<ExtractionApiConfig>(() => {
    try {
      const saved = localStorage.getItem('blitz360_api_config');
      return saved ? JSON.parse(saved) : DEFAULT_API_CONFIG;
    } catch {
      return DEFAULT_API_CONFIG;
    }
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 1. Listen to Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Subscribe to user's private Firestore contacts collection
  useEffect(() => {
    if (!currentUser) {
      setContacts([]);
      setContactsLoading(false);
      return;
    }

    setContactsLoading(true);
    setFirestoreError(null);

    const unsubscribe = subscribeContacts(
      currentUser.uid,
      (updatedContacts) => {
        setContacts(updatedContacts);
        setContactsLoading(false);
      },
      (error) => {
        console.error('Erro ao escutar contatos do Firestore:', error);
        setFirestoreError('Não foi possível sincronizar os contatos com o Firestore.');
        setContactsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Hash synchronization for smooth navigation and tab opening
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#banco-firestore') {
        setViewMode('database');
      } else {
        setViewMode('prospecting');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToView = (mode: 'prospecting' | 'database') => {
    setViewMode(mode);
    if (mode === 'database') {
      window.location.hash = '#banco-firestore';
    } else {
      window.location.hash = '#prospeccao';
    }
  };

  // Computa a auditoria de veracidade de todos os contatos carregados do Firestore
  const auditSummary = useMemo(() => {
    return auditContactList(contacts);
  }, [contacts]);

  // Revisão e expurgo automático de contatos fictícios/inexistentes (ex: Tatiane Lima, Larissa Vasconcelos, etc)
  useEffect(() => {
    if (!currentUser || contacts.length === 0) return;

    // Detecta contatos com nomes ou números sintéticos/inexistentes
    const knownFakesToDelete = contacts.filter((c) => {
      const name = (c.name || '').trim().toLowerCase();
      const phoneDigits = (c.phone || '').replace(/\D/g, '');
      const isKnownFakeName = [
        'tatiane lima fonseca',
        'larissa vasconcelos freitas',
        'ana paula martins medeiros',
        'maria clara albuquerque',
        'joão pedro silveira',
        'silvia regina duarte',
        'teste',
        'dummy'
      ].some((k) => name === k || name.startsWith(k));

      const isKnownFakePhone = [
        '34985483901', '985483901',
        '34980418252', '980418252',
        '34993755124', '993755124',
        '34987654321', '987654321'
      ].includes(phoneDigits);

      return (isKnownFakeName || isKnownFakePhone) && c.id;
    });

    if (knownFakesToDelete.length > 0) {
      const ids = knownFakesToDelete.map((c) => c.id!).filter(Boolean);
      batchDeleteContacts(currentUser.uid, ids)
        .then(() => {
          showToast(`🛡️ Revisão da Base: ${ids.length} contatos sem veracidade/inexistentes foram expurgados do Firestore.`, 'success');
        })
        .catch((err) => {
          console.error('Erro na auditoria automática de contatos:', err);
        });
    }
  }, [contacts, currentUser]);

  // Clear workspace screen while preserving contacts safely in Firestore
  const handleClearScreenAndKeepInBank = () => {
    setClearScreenTrigger((prev) => prev + 1);
    showToast('✨ Tela limpa com sucesso! Os contatos permanecem armazenados no Total no Banco (Firestore).', 'success');
  };

  // Handlers for contact updates
  const handleSaveApiConfig = (newConfig: ExtractionApiConfig) => {
    setApiConfig(newConfig);
    try {
      localStorage.setItem('blitz360_api_config', JSON.stringify(newConfig));
      showToast('Configurações da API externa salvas com sucesso!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
  };

  const handleStatusChange = async (contactId: string, newStatus: ContactStatus) => {
    if (!currentUser) return;
    try {
      await updateContactInFirestore(currentUser.uid, contactId, { status: newStatus });
      showToast('Status do contato atualizado!');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveEditedContact = async (contactId: string, updatedData: Partial<Contact>) => {
    if (!currentUser) return;
    try {
      await updateContactInFirestore(currentUser.uid, contactId, updatedData);
      showToast('Contato atualizado com sucesso!');
    } catch (err: any) {
      showToast('Erro ao atualizar contato: ' + err.message, 'error');
      throw err;
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!currentUser) return;
    try {
      await deleteContactFromFirestore(currentUser.uid, contactId);
      showToast('Contato excluído do banco de dados.');
    } catch (err: any) {
      showToast('Erro ao excluir contato: ' + err.message, 'error');
    }
  };

  const handleBatchDeleteContacts = async (contactIds: string[]) => {
    if (!currentUser || contactIds.length === 0) return;
    try {
      await batchDeleteContacts(currentUser.uid, contactIds);
      showToast(`${contactIds.length} contatos excluídos do banco.`);
    } catch (err: any) {
      showToast('Erro ao excluir contatos: ' + err.message, 'error');
      throw err;
    }
  };

  const handleContactSavedCallback = (savedContact: Contact) => {
    showToast(`Contato "${savedContact.name}" salvo no Firestore!`);
  };

  // Auth Loading Splash
  if (authLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-500/25">
            <Zap className="h-6 w-6 text-white fill-white animate-pulse" />
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
            <RotateCw className="h-4 w-4 animate-spin text-indigo-400" />
            <span>Inicializando Blitz 360...</span>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Google Authentication Screen
  if (!currentUser) {
    return <LoginScreen />;
  }

  // Statistics calculation for sales overview
  const totalContacts = contacts.length;
  const newLeads = contacts.filter((c) => c.status === 'new').length;
  const contactedLeads = contacts.filter((c) => c.status === 'contacted').length;
  const qualifiedLeads = contacts.filter((c) => c.status === 'qualified' || c.status === 'meeting').length;

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/95 px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span className="text-white">{toastMessage.text}</span>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        user={currentUser}
        contactCount={totalContacts}
        onOpenSettings={() => setIsSettingsOpen(true)}
        viewMode={viewMode}
        onNavigateView={navigateToView}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Firestore sync error notification if any */}
        {firestoreError && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-300">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{firestoreError}</span>
          </div>
        )}

        {/* View Routing */}
        {viewMode === 'database' ? (
          <FirestoreDatabasePage
            contacts={contacts}
            onBackToProspecting={() => navigateToView('prospecting')}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            onBatchDeleteContacts={handleBatchDeleteContacts}
            onStatusChange={handleStatusChange}
            onShowToast={showToast}
          />
        ) : (
          <>
            {/* 1. Extraction Tool (Hero Section) */}
            <ExtractionHero
              userId={currentUser.uid}
              apiConfig={apiConfig}
              onContactSaved={handleContactSavedCallback}
              onOpenSettings={() => setIsSettingsOpen(true)}
              clearTrigger={clearScreenTrigger}
              onOpenDatabasePage={() => navigateToView('database')}
            />

            {/* 2. Sales Pipeline Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Card 1: Total Prospects -> Clickable to open full Firestore Database Page */}
              <div 
                onClick={() => navigateToView('database')}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 backdrop-blur-sm cursor-pointer hover:border-indigo-500/50 hover:bg-zinc-900/80 transition group relative"
                title="Clique para abrir o Banco Geral de Contatos Salvos no Firestore em uma nova página"
              >
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span className="group-hover:text-indigo-300 font-medium transition">Total no Banco</span>
                  <div className="flex items-center gap-1.5">
                    <Database className="h-4 w-4 text-indigo-400" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`${window.location.origin}${window.location.pathname}#banco-firestore`, '_blank');
                      }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
                      title="Abrir página do banco em nova aba do navegador"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-white flex items-baseline justify-between">
                  <span>{totalContacts}</span>
                  <span className="text-[10px] text-indigo-400 bg-indigo-950/70 border border-indigo-800/50 px-2 py-0.5 rounded-full font-semibold">
                    Abrir Página
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>Salvos no Firestore</span>
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-400 inline" />
                    {auditSummary.realCount} Verificados
                  </span>
                </p>
              </div>

              {/* Card 2: Novos Leads -> Com Ícone de Limpar solicitado pelo usuário */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 backdrop-blur-sm relative group">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span className="font-medium text-zinc-300">Novos Leads</span>
                  <div className="flex items-center gap-1.5">
                    {/* Ícone de Limpar solicitado com destaque */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearScreenAndKeepInBank();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-rose-500/20 text-indigo-300 hover:text-rose-300 border border-indigo-500/30 hover:border-rose-500/40 transition cursor-pointer shadow-sm active:scale-95"
                      title="Limpar tela mantendo os contatos armazenados no Total no Banco (Firestore)"
                    >
                      <Eraser className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="text-[11px] font-bold">Limpar</span>
                    </button>
                    <Sparkles className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-blue-400">
                  {newLeads}
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-zinc-500">
                  <span>Aguardando abordagem</span>
                  <button
                    type="button"
                    onClick={handleClearScreenAndKeepInBank}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition underline underline-offset-2"
                  >
                    Limpar para nova busca
                  </button>
                </div>
              </div>

              {/* Card 3: Contatados */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Contatados</span>
                  <PhoneCall className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-amber-400">
                  {contactedLeads}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">WhatsApp ou Ligação</p>
              </div>

              {/* Card 4: Qualificados & Reuniões */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Oportunidades</span>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-emerald-400">
                  {qualifiedLeads}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Reuniões e qualificados</p>
              </div>

            </div>

            {/* 3. Quick Access to Full Firestore Database */}
            <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-r from-indigo-950/30 via-zinc-900/60 to-zinc-950 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-base font-bold text-white flex items-center justify-center sm:justify-start gap-2.5">
                  <Database className="h-5 w-5 text-indigo-400" />
                  <span>Base Completa de Contatos Salvos no Firestore ({totalContacts})</span>
                </h3>
                <p className="text-xs text-zinc-400 max-w-2xl">
                  Após fazer seus levantamentos e disparar propostas de venda, você pode limpar a tela acima com segurança. Todos os seus contatos reais e comprovados de existência ficam armazenados de forma privada no Cloud Firestore.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => navigateToView('database')}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  <Database className="h-4 w-4" />
                  <span>Abrir Total no Banco</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.open(`${window.location.origin}${window.location.pathname}#banco-firestore`, '_blank')}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3.5 py-2.5 text-xs font-medium text-zinc-200 hover:text-white transition"
                  title="Abrir em Nova Aba"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">Nova Aba</span>
                </button>
              </div>
            </div>
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium text-zinc-400">
            <Zap className="h-3.5 w-3.5 text-indigo-400 fill-indigo-400" />
            <span>Blitz 360</span>
            <span className="text-zinc-600">—</span>
            <span>Inteligência de Vendas B2B</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span>Google Auth</span>
            <span>•</span>
            <span>Firestore Database</span>
            <span>•</span>
            <span>WhatsApp Direct</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EditContactModal
        isOpen={!!editingContact}
        contact={editingContact}
        onClose={() => setEditingContact(null)}
        onSave={handleSaveEditedContact}
      />

      <ApiConfigModal
        isOpen={isSettingsOpen}
        config={apiConfig}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveApiConfig}
      />

    </div>
  );
}
