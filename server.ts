import {protectedHandler} from './src/server/serverAuth.js';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { makeHandler, searchBusinesses, searchBuyers, extractWebsite, cnpjLookup, resolvePublicPhone, casaCnpjLookup } from './src/server/verifiedSearch.js';
import { auditContactVeracity } from './src/utils/contactVeracityAuditor';
import {socialRadar,startSocialRadar} from './src/server/socialRadar.js';
import {sourceStatus} from './src/server/sourceStatus.js';
dotenv.config();
async function startServer() {
  const app = express();
  app.use(express.json({limit: '32kb'}));
  app.get('/api/health', (_req,res) => res.json({status:'ok',mode:'evidence-only'}));
  app.post(['/api/deep-search','/api/ai/deep-search'], protectedHandler(searchBusinesses));
  app.post(['/api/b2c-search','/api/b2c-multifactor-search'], protectedHandler((body,deps) => process.env.APIFY_API_TOKEN ? startSocialRadar(body,deps) : searchBuyers(body,deps)));
  app.post('/api/social-radar',protectedHandler(socialRadar));
  app.get('/api/source-status',(_req,res) => res.json(sourceStatus()));
  app.post('/api/extract-url', protectedHandler(extractWebsite));
  app.post('/api/casa-cnpj',protectedHandler(casaCnpjLookup));
  app.post('/api/buscar', protectedHandler(async body => cnpjLookup(body.query || '')));
  app.post('/api/contacts/audit-veracity', (req,res) => res.json(auditContactVeracity(req.body.contact || {})));
  app.post('/api/contacts/resolve-phone', protectedHandler(resolvePublicPhone));
  app.use('/api', (_req,res) => res.status(404).json({error:'Rota de dados não disponível.'}));
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({server:{middlewareMode:true},appType:'spa'});
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req,res) => res.sendFile(path.resolve('dist/index.html')));
  }
  app.listen(Number(process.env.PORT || 3000),'0.0.0.0');
}
startServer();
