import { randomUUID } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { getServerFirestore, radarKey } from './radarStore.js';
import { configureQuotePush, notifyQuoteOwner } from './quotePush.js';
import { requireUser } from './serverAuth.js';
import { makeHandler, SearchError } from './verifiedSearch.js';

const buyerTypes = new Set(['Pessoa física', 'Produtor rural', 'Construtora', 'Responsável por galpão', 'Outra empresa']);
const offerId = /^[a-f0-9-]{36}$/;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const invalid = message => { throw new SearchError(message, 422); };

export function normalizeQuote(body, offer) {
  const name = text(body.name, 100);
  const city = text(body.city, 100);
  const cep = text(body.cep, 20).replace('-', '');
  const quantity = Number(body.quantity);
  const channel = body.channel;
  const contact = text(body.contact, 254);
  if (body.consent !== true || !name || !city || !/^\d{8}$/.test(cep) ||
      !Number.isSafeInteger(quantity) || quantity < 1) {
    invalid('Preencha os dados e autorize o retorno sobre este orçamento.');
  }
  let address = contact.toLowerCase();
  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) invalid('Informe um e-mail válido.');
  } else if (channel === 'phone' || channel === 'whatsapp') {
    const phone = parsePhoneNumberFromString(contact, { defaultCountry: 'BR', extract: false });
    if (!phone?.isValid() || phone.country !== 'BR') invalid('Informe um telefone brasileiro válido com DDD.');
    address = phone.number;
  } else {
    invalid('Escolha um canal de retorno.');
  }
  if (!offer.active || quantity > offer.stock ||
      (offer.prefixes.length && !offer.prefixes.some(prefix => cep.startsWith(prefix)))) {
    throw new SearchError('O fornecedor não atende este CEP ou esta quantidade no momento.', 409);
  }
  return { name, city, cep, quantity, channel, address };
}

export function createQuoteHandler({ getDb = getServerFirestore, authenticate = requireUser, notify = notifyQuoteOwner } = {}) {
  return async (req, res) => makeHandler(async body => {
    const { action, id } = body;
    const pushAction = ['push-key', 'push-subscribe', 'push-disable'].includes(action);
    const merchantAction = pushAction || ['list', 'save', 'disable'].includes(action);
    const owner = merchantAction ? await authenticate(req) : null;
    const db = getDb();
    if (!db) throw new SearchError('A captação de orçamentos está indisponível.', 503);
    if (pushAction) return configureQuotePush(db, owner, body);
    const offers = db.collection('_blitzQuoteOffers');
    const offerRef = id && offerId.test(id) ? offers.doc(id) : null;
    if (action === 'list') {
      const snapshot = await offers.where('owner', '==', owner).limit(100).get();
      return { offers: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    }
    if (action === 'save') {
      const product = text(body.product, 120);
      const seller = text(body.seller, 100);
      const stock = Number(body.stock);
      const prefixes = [...new Set(text(body.prefixes, 500).split(/[\s,]+/).filter(Boolean))];
      if (!product || !seller || !Number.isSafeInteger(stock) || stock < 0 ||
          prefixes.some(prefix => !/^\d{2,8}$/.test(prefix)) || (id && !offerRef)) {
        invalid('Informe produto, fornecedor, estoque inteiro e prefixos de CEP válidos.');
      }
      const ref = offerRef || offers.doc(randomUUID());
      await db.runTransaction(async tx => {
        if (offerRef && (await tx.get(ref)).data()?.owner !== owner) {
          throw new SearchError('Oferta não encontrada.', 404);
        }
        if (!offerRef) {
          const existing = await tx.get(offers.where('owner', '==', owner).limit(100));
          if (existing.size >= 100) invalid('Limite de 100 ofertas atingido.');
        }
        tx.set(ref, { owner, product, seller, stock, prefixes, active: true });
      });
      return { id: ref.id };
    }
    if (!offerRef) throw new SearchError('Oferta não encontrada.', 404);
    if (action === 'disable') {
      await db.runTransaction(async tx => {
        if ((await tx.get(offerRef)).data()?.owner !== owner) throw new SearchError('Oferta não encontrada.', 404);
        tx.update(offerRef, { active: false });
      });
      return { ok: true };
    }
    if (action === 'read') {
      const offer = (await offerRef.get()).data();
      if (!offer?.active || offer.stock < 1) throw new SearchError('Oferta indisponível.', 404);
      return { product: offer.product, seller: offer.seller };
    }
    if (action !== 'request') invalid('Ação inválida.');

    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const counter = db.collection('_blitzQuoteLimits').doc(id);
    const recipient = await db.runTransaction(async tx => {
      const offer = (await tx.get(offerRef)).data();
      if (!offer?.active) throw new SearchError('Oferta indisponível.', 404);
      const quote = normalizeQuote(body, offer);
      const { name, city, cep, quantity, channel, address } = quote;
      const key = radarKey([id, day, address, cep, quantity]);
      const contact = db.collection('users').doc(offer.owner).collection('contacts').doc('quote-' + key);
      const [existing, usage] = await Promise.all([tx.get(contact), tx.get(counter)]);
      if (existing.exists) return;
      const used = usage.data()?.day === day ? usage.data().count : 0;
      if (used >= 60) throw new SearchError('Limite diário desta oferta atingido. Tente novamente amanhã.', 429);
      tx.set(counter, { day, count: used + 1 });
      tx.set(contact, {
        name, location: `${city} · CEP ${cep}`,
        phone: channel === 'email' ? '' : address,
        ...(channel === 'email' ? { email: address } : {}),
        ...(channel === 'whatsapp' ? { whatsapp: address } : {}),
        profileUrl: '', platform: 'website', status: 'new', category: 'Pedido de orçamento',
        matchedProduct: offer.product,
        ...(buyerTypes.has(body.buyerType) ? { role: body.buyerType } : {}),
        notes: `Solicitou orçamento de ${quantity} unidade(s) de ${offer.product}. Autorizou retorno por ${channel === 'email' ? 'e-mail' : channel === 'phone' ? 'telefone' : 'WhatsApp'} exclusivamente sobre este pedido.`,
        createdAt: now, updatedAt: now,
      });
      return offer.owner;
    });
    if (recipient) {
      try { await notify(db, recipient); }
      catch { console.warn("Não foi possível enviar o alerta de orçamento."); }
    }
    return { ok: true };
  })(req, res);
}
