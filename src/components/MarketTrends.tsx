import React, { useState } from 'react';
import { parseTrendsCsv, trendsExploreUrl, type TrendsPeriod } from '../utils/marketTrends';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function MarketTrends({ product }: { product: string }) {
  const [terms, setTerms] = useState('');
  const [geo, setGeo] = useState('BR');
  const [period, setPeriod] = useState<TrendsPeriod>('today 12-m');
  const [preview, setPreview] = useState<{ name: string; rows: string[][]; importedAt: string } | null>(null);
  const [error, setError] = useState('');
  let url = '';
  let validation = '';
  try { url = trendsExploreUrl(terms, geo, period); } catch (e) { validation = (e as Error).message; }

  async function importCsv(file?: File) {
    setPreview(null); setError('');
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('O CSV deve ter no máximo 1 MB.');
      setPreview({ name: file.name, rows: parseTrendsCsv(await file.text()), importedAt: new Date().toLocaleString('pt-BR') });
    } catch (e) { setError((e as Error).message); }
  }

  return <details className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-sm">
    <summary className="cursor-pointer font-semibold text-white">Inteligência de mercado — Google Trends</summary>
    <div className="mt-4 space-y-3">
      <p className="text-zinc-300">Compare interesse de pesquisa, regiões, sazonalidade e consultas relacionadas antes de prospectar.</p>
      <p className="text-xs text-amber-200">Tendências são dados agregados e anônimos. Não identificam compradores, não comprovam compra e não entram na contagem de contatos. Índice 100 não significa 100 buscas; zero pode indicar dados insuficientes.</p>
      <label className="block text-zinc-300" htmlFor="trends-terms">Termos para comparar (até cinco, separados por vírgula)</label>
      <input id="trends-terms" value={terms} onChange={e => setTerms(e.target.value)} maxLength={504} placeholder="Ex.: resina para telha, resina acrílica, telha resinada" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-white" />
      <button type="button" disabled={!product.trim()} onClick={() => setTerms(product.trim())} className="text-xs text-indigo-300 underline disabled:opacity-40">Usar produto da pesquisa</button>
      <div className="flex flex-wrap gap-3">
        <label className="text-zinc-300">Região
          <select aria-label="Região do Google Trends" value={geo} onChange={e => setGeo(e.target.value)} className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-2">
            <option value="BR">Brasil</option>{states.map(uf => <option key={uf} value={`BR-${uf}`}>{uf}</option>)}
          </select>
        </label>
        <label className="text-zinc-300">Período
          <select aria-label="Período do Google Trends" value={period} onChange={e => setPeriod(e.target.value as TrendsPeriod)} className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-2">
            <option value="today 3-m">Últimos 90 dias</option><option value="today 12-m">Últimos 12 meses</option><option value="today 5-y">Últimos 5 anos</option>
          </select>
        </label>
      </div>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Comparar no Google Trends ↗</a> : <p className="text-xs text-zinc-400">{validation}</p>}
      <p className="text-xs text-zinc-400">Consulta manual no site oficial. Confira também “Interesse por sub-região” e “Consultas relacionadas”. Nenhuma consulta automática ou API paga é acionada por este painel.</p>
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <label htmlFor="trends-csv" className="block text-zinc-300">Importar CSV exportado pelo Google Trends (até 1 MB)</label>
        <input id="trends-csv" type="file" accept=".csv,text/csv" className="block w-full text-xs text-zinc-300" onChange={e => { void importCsv(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="text-xs text-zinc-400">O arquivo é visualizado neste navegador e não é enviado ao servidor. O conteúdo e os filtros do CSV são preservados; alterar os filtros acima não atualiza o arquivo importado.</p>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {preview && <div className="space-y-2">
          <p className="text-xs text-zinc-300">Arquivo: {preview.name} · Importado em {preview.importedAt} · {preview.rows.length} linhas</p>
          <button type="button" onClick={() => setPreview(null)} className="text-xs text-indigo-300 underline">Limpar arquivo</button>
          <div className="max-h-72 overflow-auto rounded border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300"><caption className="p-2 text-left">Dados do arquivo importado — até 100 linhas; valores originais, sem cálculo de leads</caption><tbody>{preview.rows.slice(0, 100).map((row, i) => <tr key={i} className="border-t border-zinc-800">{row.map((cell, j) => <td key={j} className="px-3 py-2 whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody></table>
          </div>
        </div>}
      </div>
      <a href="https://support.google.com/trends/answer/4365533?hl=pt-BR" target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">Como interpretar os dados — documentação do Google</a>
    </div>
  </details>;
}
