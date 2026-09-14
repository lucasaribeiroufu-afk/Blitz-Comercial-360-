import { useState } from 'react';
import { 
  Zap, 
  ShieldCheck, 
  Database, 
  Sparkles, 
  ArrowRight,
  RotateCw,
  PhoneCall,
  Lock,
  Layers
} from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

export function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('Falha no login Google:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('Janela de login fechada antes da confirmação.');
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('Pop-up de autenticação bloqueado pelo navegador. Permita pop-ups para fazer login.');
      } else {
        setAuthError(error.message || 'Erro ao realizar login via Google. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-zinc-950 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      
      {/* Subtle Background Effects */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-600/15 blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="relative z-10 w-full max-w-md">
        
        {/* Main Card */}
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
          
          {/* Logo Header */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-xl shadow-indigo-500/25 ring-1 ring-white/20 mb-4">
              <Zap className="h-7 w-7 text-white fill-white" />
            </div>
            
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">Blitz 360</h1>
              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/20">
                PRO
              </span>
            </div>

            <p className="mt-2 text-xs sm:text-sm text-zinc-400">
              Plataforma de inteligência comercial e extração de contatos para times de vendas de alta conversão.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="my-6 space-y-2.5 rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-4 text-xs text-zinc-300">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>Extração instantânea de telefones via link de perfil</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Database className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Banco de dados individual e privado no Firestore</span>
            </div>
            <div className="flex items-center gap-2.5">
              <PhoneCall className="h-4 w-4 text-purple-400 shrink-0" />
              <span>Ações em 1 clique: WhatsApp, Ligação e Exportação CSV</span>
            </div>
          </div>

          {/* Auth Error notice */}
          {authError && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
              {authError}
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            id="google-login-btn"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-white py-3.5 px-4 text-sm font-bold text-zinc-900 shadow-xl transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <RotateCw className="h-5 w-5 animate-spin text-zinc-700" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isLoading ? 'Autenticando...' : 'Entrar com o Google'}</span>
          </button>

          {/* Secure indicator */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Lock className="h-3 w-3 text-emerald-500" />
            <span>Autenticação OAuth 2.0 segura via Firebase Auth</span>
          </div>

        </div>

      </div>
    </div>
  );
}
