import { useState, useRef, useEffect } from 'react';
import { 
  Zap, 
  Settings, 
  LogOut, 
  User as UserIcon, 
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  Database
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { logOut } from '../lib/firebase';

interface NavbarProps {
  user: User;
  contactCount: number;
  onOpenSettings: () => void;
  viewMode?: 'prospecting' | 'database';
  onNavigateView?: (mode: 'prospecting' | 'database') => void;
}

export function Navbar({ 
  user, 
  contactCount, 
  onOpenSettings,
  viewMode = 'prospecting',
  onNavigateView 
}: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await logOut();
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Zap className="h-5 w-5 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-white">Blitz 360</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-medium hidden sm:block">
              Sales Lead Intelligence & Contact Extractor
            </p>
          </div>
        </div>

        {/* Center/Right Stats & Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Navigation Pill Buttons */}
          {onNavigateView && (
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => onNavigateView('prospecting')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'prospecting'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Prospecção</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateView('database')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'database'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
                title="Abrir página completa do Banco Salvos no Firestore"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Total no Banco</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  viewMode === 'database' ? 'bg-indigo-800 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {contactCount}
                </span>
              </button>
            </div>
          )}

          {/* API Settings Button */}
          <button
            id="btn-settings-api"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Configurar API Externa de Extração"
          >
            <Settings className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden md:inline">API Externa</span>
          </button>

          {/* User Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="user-profile-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 p-1 pr-2 sm:pr-3 text-left hover:border-zinc-700 transition"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuário'}
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/30 text-indigo-300">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
              <span className="max-w-[100px] truncate text-xs font-medium text-zinc-200 hidden sm:inline-block">
                {user.displayName || user.email?.split('@')[0] || 'Vendedor'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-lg animate-in fade-in-50 zoom-in-95">
                <div className="px-3 py-2 border-b border-zinc-800/80">
                  <p className="text-xs font-semibold text-white truncate">
                    {user.displayName || 'Vendedor Blitz'}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {user.email}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Autenticado via Google</span>
                  </div>
                </div>

                <div className="mt-1 py-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenSettings();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/80 hover:text-white transition"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Configurações de Extração</span>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
