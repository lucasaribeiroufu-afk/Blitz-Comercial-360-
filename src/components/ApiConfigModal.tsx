import { useState } from 'react';
import { 
  X, 
  Settings, 
  Key, 
  Globe, 
  Save, 
  Check, 
  AlertCircle, 
  RotateCw,
  Sparkles,
  Layers,
  HelpCircle
} from 'lucide-react';
import type { ExtractionApiConfig } from '../types';

interface ApiConfigModalProps {
  isOpen: boolean;
  config: ExtractionApiConfig;
  onClose: () => void;
  onSave: (newConfig: ExtractionApiConfig) => void;
}

export function ApiConfigModal({
  isOpen,
  config,
  onClose,
  onSave,
}: ApiConfigModalProps) {
  const [apiUrl, setApiUrl] = useState(config.apiUrl || '');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [authHeaderName, setAuthHeaderName] = useState(config.authHeaderName || 'Authorization');
  const [requestMethod, setRequestMethod] = useState<'POST' | 'GET'>(config.requestMethod || 'POST');
  const [useCustomApi, setUseCustomApi] = useState(config.useCustomApi || false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!apiUrl.trim()) {
      setTestStatus({ success: false, message: 'Informe a URL do endpoint da API para testar.' });
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      // Simulate/test endpoint
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers[authHeaderName || 'Authorization'] = apiKey.startsWith('Bearer ')
          ? apiKey
          : `Bearer ${apiKey}`;
      }

      // Try pinging or validating structure
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido (5s)')), 5000)
      );

      const fetchPromise = fetch(apiUrl, {
        method: requestMethod,
        headers,
        body: requestMethod === 'POST' ? JSON.stringify({ test: true, profileUrl: 'https://linkedin.com/in/teste' }) : undefined,
      });

      await Promise.race([fetchPromise, timeoutPromise]);
      setTestStatus({ success: true, message: 'Conexão com a API externa estabelecida com sucesso!' });
    } catch (err: any) {
      setTestStatus({
        success: false,
        message: `Falha ao testar conexão: ${err.message}. A API pode requerer CORS ativado ou chaves válidas.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSave({
      apiUrl: apiUrl.trim(),
      apiKey: apiKey.trim(),
      authHeaderName: authHeaderName.trim() || 'Authorization',
      requestMethod,
      useCustomApi,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Configuração da API Externa</h2>
              <p className="text-[11px] text-zinc-400">
                Configure o endpoint de enriquecimento de contatos para seu time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          
          {/* Toggle Custom vs Default Engine */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 flex items-center justify-between">
            <div>
              <span className="font-semibold text-zinc-200 block">Usar API Externa Personalizada</span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                {useCustomApi
                  ? 'O app enviará os links diretamente para o seu endpoint customizado.'
                  : 'Modo padrão: Motor inteligente integrado Blitz 360 AI.'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomApi}
                onChange={(e) => setUseCustomApi(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* API URL */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              Endpoint URL (Webhook / REST API)
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="url"
                placeholder="https://api.seuservico.com/v1/enrich-contact"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                disabled={!useCustomApi}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>

          {/* API Key / Token */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              Chave de Autenticação / Token (API Key / Bearer)
            </label>
            <div className="relative">
              <Key className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                placeholder="Ex: sk_live_89a71b..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!useCustomApi}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-40 font-mono"
              />
            </div>
          </div>

          {/* Advanced config: Method and Header */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Método HTTP</label>
              <select
                value={requestMethod}
                onChange={(e) => setRequestMethod(e.target.value as 'POST' | 'GET')}
                disabled={!useCustomApi}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              >
                <option value="POST">POST (JSON Payload)</option>
                <option value="GET">GET (Query Params)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-zinc-300 mb-1">Nome do Header Auth</label>
              <input
                type="text"
                value={authHeaderName}
                onChange={(e) => setAuthHeaderName(e.target.value)}
                disabled={!useCustomApi}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>

          {/* Test Status feedback */}
          {testStatus && (
            <div
              className={`rounded-lg p-3 text-xs flex items-start gap-2 ${
                testStatus.success
                  ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-950/40 border border-amber-500/30 text-amber-300'
              }`}
            >
              {testStatus.success ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span>{testStatus.message}</span>
            </div>
          )}

          {/* Quick info note */}
          <div className="rounded-lg bg-zinc-950/40 border border-zinc-800 p-3 text-[11px] text-zinc-400 leading-relaxed">
            <span className="font-semibold text-zinc-300 block mb-1">Formatos aceitos na resposta da API:</span>
            O endpoint deve retornar um JSON com campos como <code className="text-indigo-300">name</code>, <code className="text-emerald-300">phone</code> (ou <code className="text-emerald-300">phoneNumber</code>), <code className="text-zinc-300">company</code> e <code className="text-zinc-300">role</code>.
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !useCustomApi}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition disabled:opacity-40"
            >
              {testing ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              )}
              <span>Testar Conexão</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Salvar Configuração</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
