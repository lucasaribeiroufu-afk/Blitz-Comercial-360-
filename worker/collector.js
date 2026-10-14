import {chromium} from 'playwright-core';
import robotsParser from 'robots-parser';
import {createHash} from 'node:crypto';
import {hosts,socialSource,publication,publicAuthor} from './urls.js';
import {extractVisible} from './extract.js';
const cache=new Map();
const hash=x=>createHash('sha256').update(x).digest('hex');
const assets={instagram:['static.cdninstagram.com'],facebook:['static.xx.fbcdn.net'],tiktok:['lf16-tiktok-web.ttwstatic.com','sf16-website-login.neutral.ttwstatic.com']};
const agent='Blitz360-EvidenceCollector/1.0';
const number=(v,f,min,max)=>Number.isInteger(Number(v))?Math.min(max,Math.max(min,Number(v))):f;
export function gate(snapshot,url) {
  if(snapshot.password || snapshot.challenge || /\/(login|accounts\/login|checkpoint|challenge)(\/|\?)/i.test(url) || /captcha|verify you are human|security check|login required|sign in to continue|faça login para continuar|inicie sessão para continuar|grupo privado|private group/i.test(snapshot.title+' '+snapshot.body.slice(0,5000))) throw Error('Login, CAPTCHA ou conteúdo privado: coleta interrompida');
}
function proxyOptions() {
  const raw=process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if(!raw)return undefined;
  const u=new URL(raw);return {server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};
}
async function permission(context,url,deadline) {
  const robotsUrl=new URL('/robots.txt',url).href;
  const response=await context.request.get(robotsUrl,{timeout:Math.max(1,deadline-Date.now()),maxRedirects:0});
  if(response.status()===404)return;
  if(response.status()!==200)throw Error(`robots.txt indisponível: HTTP ${response.status()}`);
  const body=await response.text();if(body.length>200000)throw Error('robots.txt excede limite');
  if(robotsParser(robotsUrl,body).isAllowed(url,agent)===false)throw Error('Leitura bloqueada por robots.txt');
}
export async function collectBatch(body) {
  const maxSources=number(body.maxSources,6,1,9), maxPages=number(body.maxPages,2,1,3), maxRecords=number(body.maxRecords,100,1,200);
  const seconds=number(process.env.WORKER_TIMEOUT_SECONDS,18,5,20),deadline=Date.now()+seconds*1000;
  let sources=body.sourceUrls || [];
  if(!Array.isArray(sources)||sources.length>9||sources.some(s=>typeof s!=='string'||s.length>500))throw Error('Até nove fontes por execução');
  if(!sources.length) {
    // Operator-curated catalog is free discovery; group names are never regional proof.
    const catalog=JSON.parse(process.env.WORKER_SOURCE_CATALOG || '[]');
    const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    sources=catalog.filter(s=>norm(s.query)===norm(body.query)&&norm(s.location)===norm(body.location)).map(s=>s.url).slice(0,9);
  }
  const queue=[...new Map(sources.map(s=>{const source=socialSource(s);return [source.url,source];})).values()];
  const reports=[],records=[],pending=[],seen=new Set();
  if(!queue.length)return {records,reports:[{source:'Descoberta gratuita',status:'blocked',consulted:false,errors:['Nenhuma fonte pública no catálogo para nicho + cidade. Informe URLs ou configure descoberta Serper dentro do orçamento.'],limits:[]}],pending,done:true};
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,timeout:Math.max(1,deadline-Date.now()),proxy:proxyOptions(),args:['--disable-dev-shm-usage']});
  try {
    while(queue.length && reports.length<maxSources && records.length<maxRecords) {
      if(Date.now()>=deadline)break;
      const source=queue.shift();if(seen.has(source.url))continue;seen.add(source.url);
      const report={source:`Worker ${source.platform}`,platform:source.platform,url:source.url,status:'running',consulted:false,received:0,pages:0,errors:[],limits:[],providerCostUsd:0};reports.push(report);
      const cached=cache.get(`${source.url}:${maxPages}:${maxRecords}`);
      if(cached?.expiresAt>Date.now() && cached.records.length<=maxRecords-records.length) {records.push(...cached.records.slice(0,maxRecords-records.length));Object.assign(report,cached.report,{cacheHit:true});continue;}
      // Fresh context per source, no cookies/storage/login credentials.
      const context=await browser.newContext({userAgent:agent,serviceWorkers:'block',acceptDownloads:false});
      let page, timer;
      try {
        timer=setTimeout(()=>context.close().catch(()=>{}),Math.max(1,deadline-Date.now()));
        report.consulted=true;
        await permission(context,source.url,deadline);
        let bytes=0;
        await context.route('**/*',async route=>{
          const u=new URL(route.request().url());
          // Tight egress: no arbitrary URL, private host, trackers, login navigation or challenge solving.
          if(u.protocol!=='https:' || !([source.platform==='instagram'?'www.instagram.com':source.platform==='facebook'?'www.facebook.com':'www.tiktok.com',...(assets[source.platform]||[])].includes(u.hostname)) || /\/(login|accounts\/login|checkpoint|challenge)(\/|\?|$)/.test(u.pathname) || ['image','media','font'].includes(route.request().resourceType()))return route.abort();
          await route.continue();
        });
        page=await context.newPage();
        page.on('response',r=>{bytes+=Number(r.headers()['content-length']||0);if(bytes>8000000)context.close().catch(()=>{});});
        const response=await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:Math.max(1,deadline-Date.now())});
        if(!response || response.status()!==200)throw Error(`Fonte respondeu HTTP ${response?.status()||'desconhecido'}`);
        const local=new Map();
        for(let pageIndex=0;pageIndex<maxPages;pageIndex++) {
          if(Date.now()>=deadline)break;
          await page.waitForTimeout(500);
          const snapshot=await page.evaluate(extractVisible,source.platform);gate(snapshot,page.url());
          socialSource(page.url()); // stop out-of-scope redirects
          report.pages++;
          for(const raw of snapshot.records) {
            const sourceUrl=publication(raw.sourceUrl,source.platform);
            const authorUrl=publicAuthor(raw.authorUrl,source.platform);
            if(!sourceUrl||!authorUrl||!raw.name||!raw.text)continue;
            const key=hash(source.platform+sourceUrl+authorUrl+raw.text);
            local.set(key,{...raw,platform:source.platform,collectionUrl:source.url,sourceUrl,authorUrl,id:raw.id||key,collector:'Playwright — DOM público visível',retrievedAt:new Date().toISOString()});
            if(local.size>=maxRecords-records.length)break;
          }
          if(!publication(source.url,source.platform))for(const link of snapshot.links){const url=publication(link,source.platform);if(url&&!seen.has(url)&&!queue.some(s=>s.url===url)&&queue.length<50)queue.push({platform:source.platform,url});}
          if(local.size>=maxRecords-records.length)break;
          await page.evaluate(()=>window.scrollBy(0,Math.max(600,innerHeight)));
        }
        const rows=[...local.values()].slice(0,maxRecords-records.length);
        records.push(...rows);report.received=rows.length;report.collectedAt=Date.now();report.expiresAt=Date.now()+900000;
        report.status=rows.length?'limited':'blocked';
        report.limits.push('Paginação por viewport limitada; comentários recolhidos não representam a totalidade da publicação.');
        if(!rows.length)report.errors.push('Nenhum bloco com texto, autor e permalink público reconhecido. Layout incompatível, conteúdo não renderizado ou acesso limitado; não comprova ausência de compradores.');
        if(rows.length){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(`${source.url}:${maxPages}:${maxRecords}`,{records:rows,report:structuredClone(report),expiresAt:report.expiresAt});}
      }catch(e){report.status='blocked';report.errors.push(String(e.message).slice(0,300));}
      finally {clearTimeout(timer);await context.close().catch(()=>{});}
    }
    pending.push(...queue.filter(s=>!seen.has(s.url)).slice(0,9));
    if(pending.length || Date.now()>=deadline)reports.push({source:'Limite do worker',status:'limited',consulted:false,received:0,errors:[],limits:['Tempo/fontes/registros atingidos; fontes pendentes disponíveis para uma nova página explícita.']});
    return {records,reports,pending,done:true};
  }finally{await browser.close();}
}
