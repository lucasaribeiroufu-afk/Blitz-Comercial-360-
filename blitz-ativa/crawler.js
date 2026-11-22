import robotsParser from 'robots-parser';
import {setTimeout as sleep} from 'node:timers/promises';
import {canonicalUrl} from './config.js';
import {rawRead, userAgent} from './http.js';
import {extract} from './extract.js';

export async function crawl(options, {read = rawRead, delayMs = 1000, deadline = Infinity, onPage = () => {}} = {}) {
  const hosts = new Set(options.sources.map(url => new URL(url).hostname));
  const robots = new Map(), lastRequest = new Map();
  const visited = new Set(options.visitedSources || []), queued = new Set(options.sources);
  const queue = options.sources.map(url => ({url, depth:0}));
  const pages = [], documents = [], records = new Map();
  async function pacedRead(url, minimum = delayMs) {
    const host = new URL(url).hostname;
    const wait = Math.max(0, (lastRequest.get(host) || 0) + minimum - Date.now());
    if (Date.now()+wait+50 >= deadline) throw Error('janela_de_execucao_esgotada');
    await sleep(wait);
    lastRequest.set(host, Date.now());
    return read(url);
  }
  async function policy(url) {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      const location = origin + '/robots.txt';
      const response = await pacedRead(location);
      if (![200,404].includes(response.status)) throw Error(`robots_indisponivel HTTP ${response.status}`);
      robots.set(origin, robotsParser(location, response.body));
    }
    const rules = robots.get(origin);
    if (rules.isAllowed(url, userAgent) === false) throw Error('robots_bloqueado');
    const minimum = Math.max(delayMs, Number(rules.getCrawlDelay(userAgent) || 0) * 1000);
    if (minimum > 60000) throw Error('crawl_delay_excede_janela_de_execucao');
    return minimum;
  }
  async function pageRead(initial) {
    let url = initial;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!hosts.has(new URL(url).hostname)) throw Error('redirecionamento_fora_do_escopo');
      // Check each redirect destination before requesting its content.
      const minimum = await policy(url);
      const response = await pacedRead(url, minimum);
      if ([301,302,303,307,308].includes(response.status)) {
        if (!response.headers.location) throw Error('redirecionamento_sem_destino');
        url = canonicalUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.status !== 200) throw Error(`HTTP ${response.status}`);
      return {url, html:response.body};
    }
    throw Error('limite_de_redirecionamentos');
  }
  while (queue.length && pages.length < options.maxPages) {
    if (Date.now()+100 >= deadline) break;
    const next = queue.shift();
    if (visited.has(next.url)) continue;
    visited.add(next.url);
    const report = {url:next.url, retrievedAt:new Date().toISOString(), attempts:0};
    for (let attempt = 0; attempt < 2; attempt++) {
      report.attempts++;
      try {
        const page = await pageRead(next.url);
        const result = extract(page.html, page.url, options);
        report.status = result.blocked ? 'blocked' : 'collected';
        report.reason = result.blocked || '';
        report.discarded = result.discarded || {};
        report.contentHash = result.contentHash;
        if (result.document) documents.push(result.document);
        for (const record of result.records) records.set(record.key, record);
        if (!result.blocked && next.depth < options.maxDepth)
          for (const link of [...(result.socialLinks || []),...result.links]) {
            if (queued.size >= options.maxPages * 5) {report.linkLimitReached = true; break;}
            if (!queued.has(link)) {
              hosts.add(new URL(link).hostname);
              queued.add(link); queue.push({url:link, depth:next.depth + 1});
            }
          }
        break;
      } catch (error) {
        report.reason = error.message;
        const blocked = /robots|crawl_delay|HTTP (401|403|429)|redirecionamento|privado|reservado/i.test(error.message);
        report.status = blocked ? 'blocked' : 'failed';
        if (blocked || attempt === 1) break;
        await sleep(1000);
      }
    }
    pages.push(report);
    await onPage({pages, records:[...records.values()], limited:queue.length > 0});
  }
  return {pages, documents, pending:queue.map(item=>item.url).slice(0,96), records:[...records.values()], limited:queue.length > 0 || pages.some(page => page.linkLimitReached)};
}
