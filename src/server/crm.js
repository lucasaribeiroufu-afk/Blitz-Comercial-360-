import { createHash } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getServerFirestore } from './radarStore.js';
import { SearchError, validCnpj } from './verifiedSearch.js';

const fields = new Set(('name cnpj phone whatsapp establishmentPhone decisionMakerPhone legalSource email instagram location profileUrl platform entityType category company role department decisionMaker pitchRecommendation trendingInsights competitorPrices demandTimeframe rating reviewsCount status notes tem_whatsapp telefone_receita razao_social nome_fantasia socios match_score website professionalContacts corporateOfficers companyContactLabel authorDeclaredLocation publicationLocation groupContext evidence verificationStatus recordType prospectSector prospectingBasis intent authorProfileUrl publishedAt geographicStatus matchedProduct').split(' '));
const statuses = new Set(['new', 'contacted', 'meeting', 'qualified', 'unreachable']);
function contactData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SearchError('Contato inválido.', 400);
  const data = Object.fromEntries(Object.entries(value).filter(([key, item]) => fields.has(key) && item !== undefined));
  if (data.status && !statuses.has(data.status)) throw new SearchError('Status inválido.', 400);
  if (JSON.stringify(data).length > 60000) throw new SearchError('Contato excede o limite de tamanho.', 400);
  return data;
}
function documentId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new SearchError('Identificador inválido.', 400);
  return value;
}
export function contactIdentity(contact) {
  const social = ['purchase_mention', 'marketplace_question'].includes(contact.recordType);
  let source = contact.profileUrl || '';
  try {
    const url = new URL(source);
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^g_mp$/.test(key)) url.searchParams.delete(key);
    url.hash = '';
    url.searchParams.sort();
    source = url.href;
  } catch { /* Manually entered contacts can have no public URL. */ }
  const key = social
    ? [contact.recordType, source, contact.authorProfileUrl || contact.name, contact.publishedAt]
    : validCnpj(contact.cnpj || '') ? ['cnpj', contact.cnpj.replace(/\D/g, '')]
      : source ? ['source', source] : ['manual', contact.name, contact.location, contact.phone, contact.email];
  return 'lead-' + createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

export async function mutateCrm(body, { userId, db = getServerFirestore() } = {}) {
  if (!userId) throw new SearchError('Login obrigatório.', 401);
  if (!db) throw new SearchError('Gravação indisponível: configure o Firebase Admin no servidor.', 503);
  const user = db.collection('users').doc(userId);
  const contacts = user.collection('contacts');
  if (body.action === 'saveContacts') {
    if (!Array.isArray(body.contacts) || !body.contacts.length || body.contacts.length > 100) throw new SearchError('Informe entre 1 e 100 contatos.', 400);
    const records = body.contacts.map(contactData);
    if (records.some(record => typeof record.name !== 'string' || !record.name.trim())) throw new SearchError('Nome do contato obrigatório.', 400);
    const unique = [...new Map(records.map(record => [contactIdentity(record), record])).entries()];
    const ids = await db.runTransaction(async transaction => {
      // Read before writing, including legacy random-ID contacts. Transactions serialize retries.
      const existing = await Promise.all(unique.map(async ([id, record]) => {
        const ref = contacts.doc(id);
        let snapshot = await transaction.get(ref);
        if (!snapshot.exists && record.profileUrl && !['purchase_mention', 'marketplace_question'].includes(record.recordType)) {
          const legacy = await transaction.get(contacts.where('profileUrl', '==', record.profileUrl).limit(1));
          if (!legacy.empty) snapshot = legacy.docs[0];
        }
        return { record, ref: snapshot.exists ? snapshot.ref : ref, old: snapshot.exists ? snapshot.data() : null };
      }));
      for (const {record, ref, old} of existing) {
        const observed = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== '' && value !== null));
        transaction.set(ref, {
          ...observed,
          status: old?.status || record.status || 'new',
          notes: old?.notes || record.notes || '',
          createdAt: old?.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }
      return existing.map(item => item.ref.id);
    });
    return {ids};
  }
  if (body.action === 'updateContact') {
    const data = contactData(body.data);
    await contacts.doc(documentId(body.id)).update({...data, updatedAt: FieldValue.serverTimestamp()});
    return {ok: true};
  }
  if (body.action === 'deleteContacts') {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 400) throw new SearchError('Informe entre 1 e 400 contatos.', 400);
    const ids = [...new Set(body.ids.map(documentId))];
    const batch = db.batch();
    for (const id of ids) batch.delete(contacts.doc(id));
    await batch.commit();
    return {ok: true};
  }
  if (body.action === 'saveProject') {
    const id = documentId(body.id);
    const setup = body.setup;
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100
      || !setup || typeof setup.product !== 'string' || !setup.product.trim()
      || JSON.stringify(setup).length > 10000) throw new SearchError('Projeto inválido.', 400);
    await user.set({prospectingProjects: {[id]: {id, name: body.name.trim(), setup}}}, {merge:true});
    return {ok: true};
  }
  if (body.action === 'deleteProject') {
    await user.update(new FieldPath('prospectingProjects', documentId(body.id)), FieldValue.delete());
    return {ok: true};
  }
  throw new SearchError('Operação de cadastro inválida.', 400);
}
