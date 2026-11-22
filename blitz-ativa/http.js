import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {publicIp} from '../src/server/verifiedSearch.js';
import {canonicalUrl} from './config.js';

export const userAgent = 'BlitzAtiva/0.1';
export function rawRead(raw, {timeout = 8000, maxBytes = 1500000} = {}) {
  const url = new URL(canonicalUrl(raw));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !publicIp(host)) throw Error('Endereço privado ou reservado bloqueado.');
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers:{'User-Agent':userAgent, Accept:'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/json,text/plain'},
      // Pin the verified public address in the connection to prevent DNS rebinding.
      lookup:publicLookup,
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        resolve({status:response.statusCode, headers:response.headers, body:''});
        return;
      }
      if (!/^(text\/(html|plain|xml)|application\/(json|rss\+xml|atom\+xml|xml|xhtml\+xml))/i.test(response.headers['content-type'] || '')) {
        response.destroy(); reject(Error('Tipo de conteúdo fora do escopo.')); return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {request.destroy(Error('Documento excede o limite de tamanho.')); return;}
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({status:200, headers:response.headers, body:Buffer.concat(chunks).toString('utf8')}));
    });
    const timer = setTimeout(() => request.destroy(Error('Tempo limite da fonte.')), timeout);
    request.on('error', reject);
    request.on('close', () => clearTimeout(timer));
  });
}

export function publicLookup(hostname, options, callback) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const resolution = net.isIP(host) ? Promise.resolve([{address:host, family:net.isIP(host)}]) : dns.lookup(host, {all:true});
  resolution.then(addresses => {
    if (!addresses.length || addresses.some(item => !publicIp(item.address)))
      return callback(Error('Endereço privado ou reservado bloqueado.'));
    if (options?.all) callback(null,addresses);
    else callback(null,addresses[0].address,addresses[0].family);
  },callback);
}
