import type {MarketplaceSignal} from '../types';
import {SourceEvidence} from './SourceEvidence';
export function MarketplaceInsights({signals}:{signals:MarketplaceSignal[]}) {
 if(!signals.length)return null;
 return <section className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
  <h3 className="text-sm font-semibold text-zinc-200">Shopee e Mercado Livre — produtos e perguntas públicas</h3>
  <p className="mt-1 text-xs text-amber-300">Estes registros não identificam compradores. Cidade de envio e vendas históricas não comprovam intenção de compra em Uberlândia.</p>
  <div className="mt-3 grid gap-3 md:grid-cols-2">{signals.map((s,index)=><article key={`${s.sourceUrl}:${s.questionId || index}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
   <p className="font-semibold">{s.platform==='shopee'?'Shopee: produto':'Mercado Livre: pergunta anônima'}</p>
   {s.name?<p className="mt-1">{s.name}</p>:null}
   {s.priceBRL!==undefined?<p>Preço publicado: {s.priceBRL.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}{s.priceIsPix?' (Pix)':''}</p>:null}
   {s.shippingOrigin?<p>Origem do envio: {s.shippingOrigin}</p>:null}
   {s.soldCount!==undefined?<p>Vendidos publicados: {s.soldCount} · período: {s.soldPeriod || 'não informado'}</p>:null}
   {s.question?<blockquote className="mt-1">{s.question}</blockquote>:null}
   {s.recordType==='marketplace_question'?<p className="mt-1">Região no texto: {s.regionalMatch?'mencionada pelo autor':'não confirmada'} · data da pergunta: não disponível</p>:null}
   <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sky-400 underline">Abrir fonte</a>
   <SourceEvidence record={s}/>
  </article>)}</div>
 </section>;
}
