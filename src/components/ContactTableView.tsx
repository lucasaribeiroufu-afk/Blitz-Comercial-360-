import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Trash2, 
  ExternalLink, 
  MessageSquare, 
  PhoneCall, 
  Copy, 
  Check, 
  LayoutGrid, 
  List, 
  Edit3,
  Phone,
  MapPin,
  Flame,
  FileText,
  Calendar,
  Filter,
  ArrowUpDown,
  RotateCcw,
  Clock,
  ChevronDown,
  X,
  Mail,
  DollarSign,
  Sparkles,
  FileSpreadsheet,
  User,
  Building2,
  Users,
  Globe,
  Truck,
  Zap,
  Tractor,
  Fuel,
  Instagram
} from 'lucide-react';
import type { Contact, ContactStatus } from '../types';
import { ContactCard } from './ContactCard';
import { hasPurchaseIntent } from '../utils/purchaseIntent';
import { parseProductInsight, hasShippingIncluded } from '../utils/productHelper';
import { getOptimalContactTiming } from '../utils/salesScripts';
import { WhatsAppPitchModal } from './WhatsAppPitchModal';
import { InstagramLogo } from './InstagramLogo';
import { resolveInstagram } from '../utils/instagramHelper';
import { resolveWhatsAppNumber } from '../utils/phoneHelper';

interface ContactTableViewProps {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onStatusChange?: (contactId: string, newStatus: ContactStatus) => void;
}

export type DateFilterType = 'all' | 'today' | '24h' | '7d' | '30d' | 'this_month' | 'custom';
export type SortOptionType = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

export function ContactTableView({
  contacts,
  onEdit,
  onDelete,
  onStatusChange,
}: ContactTableViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | 'pf' | 'pj'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOptionType>('date_desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [copiedInstagramId, setCopiedInstagramId] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [activePitchContact, setActivePitchContact] = useState<Contact | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter and Sort contacts
  const filteredContacts = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = contacts.filter((c) => {
      // 1. Text Search matching
      const matchSearch =
        !searchTerm.trim() ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.instagram && c.instagram.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.location && c.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.category && c.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        c.profileUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.role && c.role.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.decisionMaker && c.decisionMaker.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.department && c.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.pitchRecommendation && c.pitchRecommendation.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.competitorPrices && c.competitorPrices.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.trendingInsights && c.trendingInsights.some((item) => item.toLowerCase().includes(searchTerm.toLowerCase())));

      // 2. Status matching
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'need_alert'
          ? hasPurchaseIntent(c.notes)
          : c.status === statusFilter;

      // 3. Entity Type matching
      const matchEntity =
        entityFilter === 'all'
          ? true
          : (c.entityType || 'pj') === entityFilter;

      // 4. Date of Addition matching
      let matchDate = true;
      const contactTime = c.createdAt || c.updatedAt || 0;

      if (dateFilter === 'today') {
        matchDate = contactTime >= startOfToday.getTime();
      } else if (dateFilter === '24h') {
        matchDate = contactTime >= now - 24 * 60 * 60 * 1000;
      } else if (dateFilter === '7d') {
        matchDate = contactTime >= now - 7 * 24 * 60 * 60 * 1000;
      } else if (dateFilter === '30d') {
        matchDate = contactTime >= now - 30 * 24 * 60 * 60 * 1000;
      } else if (dateFilter === 'this_month') {
        matchDate = contactTime >= startOfMonth.getTime();
      } else if (dateFilter === 'custom') {
        if (customStartDate) {
          const startTime = new Date(customStartDate + 'T00:00:00').getTime();
          if (contactTime < startTime) matchDate = false;
        }
        if (customEndDate) {
          const endTime = new Date(customEndDate + 'T23:59:59').getTime();
          if (contactTime > endTime) matchDate = false;
        }
      }

      return matchSearch && matchStatus && matchEntity && matchDate;
    });

    // Sorting
    return result.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (sortBy === 'date_asc') {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [contacts, searchTerm, statusFilter, entityFilter, dateFilter, customStartDate, customEndDate, sortBy]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (statusFilter !== 'all') count++;
    if (entityFilter !== 'all') count++;
    if (dateFilter !== 'all') count++;
    if (sortBy !== 'date_desc') count++;
    return count;
  }, [searchTerm, statusFilter, entityFilter, dateFilter, sortBy]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setEntityFilter('all');
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSortBy('date_desc');
  };

  const handleCopyPhone = (id: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyEmail = (id: string, email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmailId(id);
    setTimeout(() => setCopiedEmailId(null), 2000);
  };

  const handleCopyInstagram = (id: string, instagram: string) => {
    navigator.clipboard.writeText(instagram);
    setCopiedInstagramId(id);
    setTimeout(() => setCopiedInstagramId(null), 2000);
  };

  /**
   * Generates and downloads a CSV containing all rich contact data:
   * (nome, telefone, e-mail, localização e estratégia, decisor, produtos recentes, preços concorrentes, etc.)
   */
  const exportToCSV = (targetScope: 'filtered' | 'all' = 'filtered') => {
    let listToExport: Contact[] = [];
    let fileSuffix = 'filtrados';

    if (targetScope === 'all') {
      listToExport = contacts;
      fileSuffix = `todos_${listToExport.length}`;
    } else {
      // Default: filtered view
      listToExport = filteredContacts;
      fileSuffix = `filtrados_${listToExport.length}`;
    }

    if (listToExport.length === 0) {
      alert('Nenhum contato disponível para exportação com os parâmetros atuais.');
      return;
    }

    // Complete CSV Headers for CRM & Sales Platforms
    const headers = [
      'Tipo de Cliente (PF/PJ)',
      'Nome / Razão Social / Posto / Fazenda',
      'Gerente de Compras / Decisor Titular',
      'Telefone / WhatsApp',
      'Instagram (Perfil / Endereço)',
      'Localização Completa',
      'E-mail',
      'Estratégia de Abordagem para Venda (Pitch)',
      'Departamento / Setor de Compras',
      'Produtos Buscados para Compra (Recentes)',
      'Preços de Concorrentes & Margens',
      'Recência / Janela de Demanda',
      'Categoria / Nicho',
      'Status no Funil',
      'Alerta de Intenção de Compra',
      'Link / Google Maps',
      'Observações / Notas',
      'Data de Extração / Cadastro'
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const statusLabels: Record<ContactStatus, string> = {
      new: 'Novo Lead',
      contacted: 'Contatado',
      meeting: 'Reunião Agendada',
      qualified: 'Qualificado',
      unreachable: 'Sem Retorno',
    };

    const rows = listToExport.map((c) => {
      const isUrgentBuy = hasPurchaseIntent(c.notes) ? 'SIM (Alerta Ativo)' : 'NÃO';
      const createdDateFormatted = c.createdAt 
        ? `${new Date(c.createdAt).toLocaleDateString('pt-BR')} ${new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : '';

      const entityLabel = c.entityType === 'pf' ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ/CNPJ)';
      const insta = resolveInstagram(c);

      return [
        escapeCsv(entityLabel),
        escapeCsv(c.name),
        escapeCsv(c.decisionMaker || ''),
        escapeCsv(c.phone),
        escapeCsv(insta.handle),
        escapeCsv(c.location || ''),
        escapeCsv(c.email || ''),
        escapeCsv(c.pitchRecommendation || ''),
        escapeCsv(c.department || ''),
        escapeCsv(c.trendingInsights ? c.trendingInsights.join('; ') : ''),
        escapeCsv(c.competitorPrices || ''),
        escapeCsv(c.demandTimeframe || 'Últimos 7 dias'),
        escapeCsv(c.category || c.role || ''),
        escapeCsv(statusLabels[c.status] || c.status),
        escapeCsv(isUrgentBuy),
        escapeCsv(c.profileUrl || ''),
        escapeCsv(c.notes || ''),
        escapeCsv(createdDateFormatted),
      ];
    });

    // Generate CSV content with UTF-8 BOM for full Microsoft Excel / Google Sheets / CRM compatibility
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `leads_prospeccao_${fileSuffix}_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsExportMenuOpen(false);
    setExportFeedback(`Exportado com sucesso (${listToExport.length} contatos)!`);
    setTimeout(() => setExportFeedback(null), 3500);
  };

  const statusCounts = useMemo(() => {
    return {
      all: contacts.length,
      needAlert: contacts.filter((c) => hasPurchaseIntent(c.notes)).length,
      new: contacts.filter((c) => c.status === 'new').length,
      contacted: contacts.filter((c) => c.status === 'contacted').length,
      meeting: contacts.filter((c) => c.status === 'meeting').length,
      qualified: contacts.filter((c) => c.status === 'qualified').length,
      unreachable: contacts.filter((c) => c.status === 'unreachable').length,
    };
  }, [contacts]);

  return (
    <div className="space-y-4">
      
      {/* Top Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm shadow-sm">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            id="search-contacts-input"
            type="text"
            placeholder="Buscar por empresa, decisor, produto, telefone ou local..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 py-2 pl-9 pr-8 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Action Buttons & View Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Prominent Export Button with Dropdown Options */}
          <div className="relative" ref={exportMenuRef}>
            <div className="flex items-center rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-0.5 shadow-sm shadow-emerald-500/10">
              <button
                id="export-csv-main-btn"
                onClick={() => exportToCSV('filtered')}
                disabled={contacts.length === 0}
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 hover:text-white transition disabled:opacity-50"
                title="Exportar contatos para planilha CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Exportar CSV ({filteredContacts.length})
                </span>
              </button>
              
              <button
                id="export-csv-dropdown-toggle"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                disabled={contacts.length === 0}
                className="rounded-md p-1 text-emerald-400 hover:bg-emerald-500/20 hover:text-white transition disabled:opacity-50 border-l border-emerald-500/30 ml-0.5"
                title="Opções de Exportação"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Export Dropdown Menu */}
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1.5 border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Opções de Exportação CSV
                </div>
                
                <div className="py-1 space-y-1">
                  <button
                    onClick={() => exportToCSV('filtered')}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="h-3.5 w-3.5 text-indigo-400" />
                      <div>
                        <div className="font-semibold text-zinc-100">Contatos Filtrados (Visão Atual)</div>
                        <div className="text-[10px] text-zinc-400">Com filtros de status, data e busca ativos</div>
                      </div>
                    </div>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                      {filteredContacts.length}
                    </span>
                  </button>

                  <button
                    onClick={() => exportToCSV('all')}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="h-3.5 w-3.5 text-sky-400" />
                      <div>
                        <div className="font-semibold text-zinc-100">Toda a Base de Contatos</div>
                        <div className="text-[10px] text-zinc-400">Exporta todos os leads cadastrados</div>
                      </div>
                    </div>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                      {contacts.length}
                    </span>
                  </button>
                </div>

                <div className="mt-1 pt-1.5 border-t border-zinc-800 text-[10px] text-zinc-500 px-2 leading-relaxed">
                  ✓ Inclui Nome, Telefone, E-mail, Localização, Estratégia de Abordagem, Decisor, Produtos e Preços (UTF-8 com BOM para Excel e CRM).
                </div>
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`rounded-md p-1.5 text-xs transition ${
                viewMode === 'cards'
                  ? 'bg-zinc-800 text-white font-medium shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Visualização em Cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-md p-1.5 text-xs transition ${
                viewMode === 'table'
                  ? 'bg-zinc-800 text-white font-medium shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Visualização em Tabela"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

        </div>

      </div>

      {/* Export Feedback Banner */}
      {exportFeedback && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2.5 px-3.5 text-xs text-emerald-200 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{exportFeedback} Arquivo CSV pronto para importação em CRMs e planilhas.</span>
          </div>
          <button onClick={() => setExportFeedback(null)} className="text-emerald-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Dedicated Filter Bar (Barra de Filtros por Status, Data de Adição e Ordenação) */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          
          {/* Left: Filter Controls Grid */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            
            {/* Filter Label with Icon */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mr-1">
              <Filter className="h-3.5 w-3.5 text-indigo-400" />
              <span>Filtros:</span>
            </div>

            {/* Filter 1: Status Dropdown */}
            <div className="relative min-w-[170px] flex items-center rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1.5 text-xs focus-within:border-indigo-500">
              <span className="text-[10px] uppercase font-bold text-zinc-500 mr-2 shrink-0">Status:</span>
              <select
                id="filter-status-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-zinc-900 text-zinc-200">Todos ({statusCounts.all})</option>
                <option value="need_alert" className="bg-zinc-900 text-amber-300 font-semibold">🔥 Alerta de Necessidade ({statusCounts.needAlert})</option>
                <option value="new" className="bg-zinc-900 text-zinc-200">Novo ({statusCounts.new})</option>
                <option value="contacted" className="bg-zinc-900 text-zinc-200">Contatado ({statusCounts.contacted})</option>
                <option value="meeting" className="bg-zinc-900 text-zinc-200">Reunião ({statusCounts.meeting})</option>
                <option value="qualified" className="bg-zinc-900 text-zinc-200">Qualificado ({statusCounts.qualified})</option>
                <option value="unreachable" className="bg-zinc-900 text-zinc-200">Sem Retorno ({statusCounts.unreachable})</option>
              </select>
            </div>

            {/* Filter 2: Date Added Dropdown (Data de Adição) */}
            <div className="relative min-w-[190px] flex items-center rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1.5 text-xs focus-within:border-indigo-500">
              <Calendar className="h-3.5 w-3.5 text-emerald-400 mr-1.5 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-zinc-500 mr-2 shrink-0">Data:</span>
              <select
                id="filter-date-select"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilterType)}
                className="w-full bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-zinc-900 text-zinc-200">Qualquer data</option>
                <option value="today" className="bg-zinc-900 text-zinc-200">Adicionados Hoje</option>
                <option value="24h" className="bg-zinc-900 text-zinc-200">Últimas 24 horas</option>
                <option value="7d" className="bg-zinc-900 text-zinc-200">Últimos 7 dias</option>
                <option value="30d" className="bg-zinc-900 text-zinc-200">Últimos 30 dias</option>
                <option value="this_month" className="bg-zinc-900 text-zinc-200">Este Mês</option>
                <option value="custom" className="bg-zinc-900 text-indigo-300">Personalizado...</option>
              </select>
            </div>

            {/* Filter 3: Sort Order Dropdown */}
            <div className="relative min-w-[180px] flex items-center rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1.5 text-xs focus-within:border-indigo-500">
              <ArrowUpDown className="h-3.5 w-3.5 text-blue-400 mr-1.5 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-zinc-500 mr-2 shrink-0">Ordem:</span>
              <select
                id="filter-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOptionType)}
                className="w-full bg-transparent font-medium text-zinc-200 focus:outline-none cursor-pointer text-xs"
              >
                <option value="date_desc" className="bg-zinc-900 text-zinc-200">Mais recentes primeiro</option>
                <option value="date_asc" className="bg-zinc-900 text-zinc-200">Mais antigos primeiro</option>
                <option value="name_asc" className="bg-zinc-900 text-zinc-200">Nome (A - Z)</option>
                <option value="name_desc" className="bg-zinc-900 text-zinc-200">Nome (Z - A)</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                title="Limpar todos os filtros aplicados"
              >
                <RotateCcw className="h-3 w-3 text-zinc-400" />
                <span>Limpar ({activeFiltersCount})</span>
              </button>
            )}

          </div>

          {/* Right: Results Count Indicator */}
          <div className="flex items-center gap-2 text-xs text-zinc-400 shrink-0 self-end lg:self-center">
            <span className="font-medium text-zinc-300">
              Exibindo <span className="font-bold text-indigo-400">{filteredContacts.length}</span> de <span className="text-zinc-200">{contacts.length}</span> contatos
            </span>
          </div>

        </div>

        {/* Custom Date Range Picker Row (only when 'custom' dateFilter is active) */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800/60 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              <span>Intervalo de Adição:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-zinc-400">De:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-zinc-400">Até:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {(customStartDate || customEndDate) && (
              <button
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[11px] text-zinc-400 hover:text-rose-400 transition underline"
              >
                Limpar datas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Filter Tabs by Status & Entity Type */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-zinc-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Todos os Contatos', count: statusCounts.all },
            { id: 'need_alert', label: 'Alerta de Necessidade', count: statusCounts.needAlert, isFlame: true },
            { id: 'new', label: 'Novos', count: statusCounts.new },
            { id: 'contacted', label: 'Contatados', count: statusCounts.contacted },
            { id: 'meeting', label: 'Reunião Marcada', count: statusCounts.meeting },
            { id: 'qualified', label: 'Qualificados', count: statusCounts.qualified },
            { id: 'unreachable', label: 'Sem Retorno', count: statusCounts.unreachable },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === tab.id
                  ? tab.isFlame
                    ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white shadow-md shadow-orange-600/25'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : tab.isFlame
                  ? 'text-amber-400 bg-amber-950/30 border border-amber-500/20 hover:bg-amber-900/40 hover:text-amber-300'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              {tab.isFlame && <Flame className="h-3.5 w-3.5 text-orange-400 fill-orange-400 animate-pulse" />}
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  statusFilter === tab.id
                    ? 'bg-black/30 text-white font-bold'
                    : tab.isFlame
                    ? 'bg-amber-500/20 text-amber-300 font-bold'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Entity Type Filter Toggle: Todos / PF / PJ */}
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setEntityFilter('all')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              entityFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="h-3 w-3" />
            <span>Todos</span>
          </button>
          <button
            type="button"
            onClick={() => setEntityFilter('pf')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              entityFilter === 'pf'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="h-3 w-3" />
            <span>PF</span>
          </button>
          <button
            type="button"
            onClick={() => setEntityFilter('pj')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              entityFilter === 'pj'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Building2 className="h-3 w-3" />
            <span>PJ</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-400 mb-3">
            <Phone className="h-6 w-6 text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-white">Nenhum contato encontrado</h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
            {activeFiltersCount > 0
              ? 'Nenhum lead corresponde aos filtros de busca, status ou período de adição selecionados.'
              : 'Realize uma busca no Google por nicho e cidade acima para extrair e salvar seus primeiros leads.'}
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpar Filtros Ativos</span>
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="p-3.5">Nome da Empresa & Decisor</th>
                  <th className="p-3.5">Telefone & E-mail</th>
                  <th className="p-3.5">
                    <div className="flex items-center gap-1.5 text-pink-300">
                      <InstagramLogo size={15} />
                      <span>Instagram Oficial</span>
                    </div>
                  </th>
                  <th className="p-3.5">Produtos Buscados & Preços</th>
                  <th className="p-3.5">Estratégia de Abordagem</th>
                  <th className="p-3.5">Localização Maps</th>
                  <th className="p-3.5">Data de Adição</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-medium">
                {filteredContacts.map((contact) => {
                  const resolvedPhone = resolveWhatsAppNumber(contact);
                  const cleanPhone = resolvedPhone.cleanPhone;
                  const displayPhone = resolvedPhone.displayPhone;
                  const insta = resolveInstagram(contact);

                  return (
                    <tr
                      key={contact.id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Empresa / Pessoa & Decisor */}
                      <td className="p-3.5">
                        {Boolean(
                          contact.category?.toLowerCase().includes('rural') || 
                          contact.category?.toLowerCase().includes('cana') || 
                          contact.category?.toLowerCase().includes('fazenda') ||
                          contact.company?.toLowerCase().includes('fazenda') ||
                          contact.name.toLowerCase().includes('fazenda') ||
                          contact.decisionMaker?.toLowerCase().includes('produtor')
                        ) ? (
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                <Tractor className="h-3 w-3 text-emerald-400 shrink-0" />
                                <span>Fazenda / Produtor</span>
                              </span>
                            </div>
                            <div className="font-bold text-white truncate max-w-[220px] mt-0.5" title={contact.company || contact.name}>
                              {contact.company || (contact.name.includes('-') ? contact.name.split('-')[0].trim() : contact.name)}
                            </div>
                            {contact.decisionMaker && (
                              <div className="text-[11px] font-semibold text-indigo-300 truncate max-w-[220px]">
                                Produtor: {contact.decisionMaker}
                              </div>
                            )}
                            {contact.department && (
                              <div className="text-[10px] text-zinc-400 truncate max-w-[220px]">
                                {contact.department}
                              </div>
                            )}
                          </div>
                        ) : Boolean(
                          contact.category?.toLowerCase().includes('posto') || 
                          contact.category?.toLowerCase().includes('combust') || 
                          contact.company?.toLowerCase().includes('posto') ||
                          contact.name.toLowerCase().includes('posto') ||
                          (contact.decisionMaker?.toLowerCase().includes('compras') && (contact.department?.toLowerCase().includes('combust') || contact.category?.toLowerCase().includes('combust')))
                        ) ? (
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                                <Fuel className="h-3 w-3 text-amber-400 shrink-0" />
                                <span>Posto de Combustível</span>
                              </span>
                            </div>
                            <div className="font-bold text-white truncate max-w-[220px] mt-0.5" title={contact.company || contact.name}>
                              {contact.company || contact.name}
                            </div>
                            {contact.decisionMaker && (
                              <div className="text-[11px] font-semibold text-orange-300 truncate max-w-[220px]" title={contact.decisionMaker}>
                                Gerente: {contact.decisionMaker}
                              </div>
                            )}
                            {contact.department && (
                              <div className="text-[10px] text-zinc-400 truncate max-w-[220px]" title={contact.department}>
                                {contact.department}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                                contact.entityType === 'pf' ? 'text-purple-400' : 'text-blue-400'
                              }`}>
                                {contact.entityType === 'pf' ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                              </span>
                              <div className="font-bold text-white truncate max-w-[200px]" title={contact.name}>
                                {contact.name}
                              </div>
                              {contact.entityType === 'pf' ? (
                                <span className="rounded bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.2 text-[9px] font-bold text-purple-300">
                                  PF
                                </span>
                              ) : (
                                <span className="rounded bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.2 text-[9px] font-bold text-blue-300">
                                  PJ
                                </span>
                              )}
                              {hasPurchaseIntent(contact.notes) && (
                                <span 
                                  className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border border-orange-500/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 shadow-sm shadow-orange-500/10 shrink-0"
                                  title={`Alerta de Necessidade: ${contact.notes || 'Intenção de compra detectada'}`}
                                >
                                  <Flame className="h-3 w-3 text-orange-400 fill-orange-400 animate-pulse" />
                                  <span>Alerta</span>
                                </span>
                              )}
                            </div>
                            {contact.decisionMaker && (
                              <div className="text-[11px] font-semibold text-indigo-300 truncate max-w-[200px] mt-0.5">
                                Decisor: {contact.decisionMaker}
                              </div>
                            )}
                            {contact.category && (
                              <div className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                                {contact.category} {contact.department ? `• ${contact.department}` : ''}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Telefone & E-mail */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-bold text-xs">
                            <Phone className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>{displayPhone}</span>
                            <button
                              onClick={() => handleCopyPhone(contact.id!, displayPhone)}
                              className="text-zinc-500 hover:text-white"
                              title="Copiar WhatsApp do Decisor"
                            >
                              {copiedId === contact.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          {resolvedPhone.establishmentPhone && resolvedPhone.establishmentPhone !== displayPhone && (
                            <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1" title="Telefone fixo da empresa / PABX">
                              <Building2 className="h-2.5 w-2.5 text-zinc-500 shrink-0" />
                              <span>{resolvedPhone.establishmentPhone}</span>
                            </div>
                          )}

                          {contact.email ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-sky-300 font-mono">
                              <Mail className="h-3 w-3 text-sky-400 shrink-0" />
                              <a
                                href={`mailto:${contact.email}`}
                                className="hover:underline truncate max-w-[140px]"
                                title={contact.email}
                              >
                                {contact.email}
                              </a>
                              <button
                                onClick={() => handleCopyEmail(contact.id!, contact.email!)}
                                className="text-zinc-500 hover:text-white"
                                title="Copiar e-mail"
                              >
                                {copiedEmailId === contact.id ? (
                                  <Check className="h-3 w-3 text-sky-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-600 block">Sem e-mail direto</span>
                          )}
                        </div>
                      </td>

                      {/* Instagram Oficial com Logotipo e Perfil Real */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1.5 min-w-[175px]">
                          <div className="flex items-center gap-2">
                            <InstagramLogo size={20} className="shrink-0 rounded-md shadow-sm" />
                            <div className="min-w-0">
                              <a
                                href={insta.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono font-bold text-xs text-pink-300 hover:text-white hover:underline truncate block"
                                title={`Abrir perfil do Instagram: ${insta.url}`}
                              >
                                {insta.handle}
                              </a>
                              {insta.isVerifiedBrand ? (
                                <span className="inline-flex items-center gap-1 rounded bg-pink-500/20 border border-pink-400/40 px-1 py-0.2 text-[8px] font-bold text-pink-300">
                                  <Check className="h-2 w-2 text-pink-400" />
                                  OFICIAL VERIFICADO
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-500 block truncate">
                                  {contact.entityType === 'pf' ? 'Perfil Pessoal' : 'Perfil Comercial'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <a
                              href={insta.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gradient-to-r from-pink-950/70 to-purple-950/70 text-pink-200 hover:text-white border border-pink-700/50 hover:border-pink-400 transition shadow-sm"
                              title="Acessar página no Instagram"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              <span>Acessar</span>
                            </a>
                            <button
                              onClick={() => handleCopyInstagram(contact.id!, insta.handle)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition cursor-pointer"
                              title="Copiar endereço do Instagram"
                            >
                              {copiedInstagramId === contact.id ? (
                                <>
                                  <Check className="h-2.5 w-2.5 text-pink-400" />
                                  <span className="text-pink-400">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-2.5 w-2.5" />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Produtos Buscados & Preços Concorrentes */}
                      <td className="p-3.5">
                        <div className="max-w-[240px] space-y-1.5">
                          {contact.trendingInsights && contact.trendingInsights.length > 0 ? (
                            <div className="space-y-1">
                              {contact.trendingInsights.slice(0, 2).map((item, idx) => {
                                const parsed = parseProductInsight(item);
                                return (
                                  <div
                                    key={idx}
                                    className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300"
                                    title={item}
                                  >
                                    <div className="font-medium truncate">{parsed.productName}</div>
                                    {parsed.destinationSite && (
                                      <div className="text-[9px] text-indigo-300 flex items-center gap-0.5 mt-0.5 font-normal">
                                        <Globe className="h-2.5 w-2.5 text-indigo-400 shrink-0" />
                                        <span className="truncate">{parsed.destinationSite}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {contact.trendingInsights.length > 2 && (
                                <span className="text-[9px] text-zinc-500 block">
                                  +{contact.trendingInsights.length - 2} outro(s) produto(s)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-[11px]">-</span>
                          )}

                          {contact.competitorPrices && (
                            <div className="text-[10px] text-emerald-300/90 bg-emerald-950/20 border border-emerald-500/20 rounded p-1" title={contact.competitorPrices}>
                              <div className="flex items-center gap-1 font-semibold text-emerald-400 text-[9px] mb-0.5">
                                <DollarSign className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                                <span>Preços & Margens</span>
                                {hasShippingIncluded(contact.competitorPrices) && (
                                  <span className="text-[8px] bg-emerald-500/20 px-1 rounded text-emerald-300 ml-auto flex items-center gap-0.5">
                                    <Truck className="h-2 w-2" />
                                    Frete Incluso
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-zinc-300 text-[10px]">{contact.competitorPrices}</div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Estratégia de Abordagem / Pitch */}
                      <td className="p-3.5">
                        {contact.pitchRecommendation ? (
                          <div className="max-w-[200px] text-[11px] text-zinc-300 bg-indigo-950/20 border border-indigo-500/20 p-1.5 rounded-lg">
                            <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-indigo-400 mb-0.5">
                              <Sparkles className="h-2.5 w-2.5" />
                              <span>Estratégia</span>
                            </div>
                            <p className="line-clamp-2 text-[10px] text-zinc-200" title={contact.pitchRecommendation}>
                              {contact.pitchRecommendation}
                            </p>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Localização Maps */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-1 text-zinc-300 max-w-[170px]" title={contact.location}>
                          <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="truncate text-xs block">{contact.location || 'Brasil'}</span>
                            {contact.profileUrl && (
                              <a
                                href={contact.profileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400 hover:underline mt-0.5"
                              >
                                <span>Ver Maps</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Data de Adição */}
                      <td className="p-3.5 whitespace-nowrap text-[11px] text-zinc-400">
                        <div className="flex items-center gap-1.5" title={contact.createdAt ? new Date(contact.createdAt).toLocaleString('pt-BR') : ''}>
                          <Calendar className="h-3 w-3 text-emerald-400/80 shrink-0" />
                          <span>
                            {contact.createdAt
                              ? new Date(contact.createdAt).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                                })
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          contact.status === 'new'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : contact.status === 'contacted'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : contact.status === 'meeting'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : contact.status === 'qualified'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {contact.status === 'new'
                            ? 'Novo'
                            : contact.status === 'contacted'
                            ? 'Contatado'
                            : contact.status === 'meeting'
                            ? 'Reunião'
                            : contact.status === 'qualified'
                            ? 'Qualificado'
                            : 'Sem retorno'}
                        </span>
                      </td>

                      {/* Ações Rápidas */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* Main Sales Pitch Trigger */}
                          <button
                            onClick={() => setActivePitchContact(contact)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition"
                            title="Abrir Central de Scripts WhatsApp e Fechamento"
                          >
                            <Zap className="h-3.5 w-3.5 fill-white" />
                            <span>Abordagem</span>
                          </button>

                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-md bg-zinc-800 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"
                            title="Conversar no WhatsApp Direto"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </a>
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="p-1.5 rounded-md bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white transition"
                              title="Enviar E-mail"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <a
                            href={`tel:${cleanPhone}`}
                            className="p-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                            title="Ligar"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </a>
                          <button
                            onClick={() => onEdit(contact)}
                            className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                            title="Editar"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(contact.id!)}
                            className="p-1.5 rounded-md text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 transition"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Render Active Pitch Modal for Table Row Clicks */}
      {activePitchContact && (
        <WhatsAppPitchModal
          contact={activePitchContact}
          isOpen={Boolean(activePitchContact)}
          onClose={() => setActivePitchContact(null)}
          onStatusUpdated={onStatusChange}
          onContactUpdated={(updated) => {
            onEdit(updated);
            setActivePitchContact(updated);
          }}
        />
      )}

    </div>
  );
}
