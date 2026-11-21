import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { mutateCrm } from './crmApi';
import { db } from '../lib/firebase';
import type { Contact } from '../types';

export function subscribeContacts(
  userId: string,
  onUpdate: (contacts: Contact[]) => void,
  onError?: (error: Error) => void
) {
  if (!userId) return () => {};

  const contactsRef = collection(db, 'users', userId, 'contacts');
  const q = query(contactsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const contacts: Contact[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || '',
          evidence: data.evidence || {},
          professionalContacts: data.professionalContacts || [],
          corporateOfficers: data.corporateOfficers || data.socios || [],
          companyContactLabel: data.companyContactLabel || '',
          authorDeclaredLocation: data.authorDeclaredLocation || '',
          publicationLocation: data.publicationLocation || '',
          groupContext: data.groupContext || '',
          verificationStatus: data.verificationStatus,
          recordType: data.recordType,
          prospectSector:data.prospectSector || '', prospectingBasis:data.prospectingBasis || '',
          intent: data.intent,
          authorProfileUrl: data.authorProfileUrl || '',
          publishedAt: data.publishedAt || '',
          geographicStatus: data.geographicStatus || '',
          matchedProduct: data.matchedProduct || '',
          profileUrl: data.profileUrl || '',
          phone: data.phone || '',
          email: data.email || '',
          location: data.location || '',
          platform: data.platform || 'google_maps',
          category: data.category || '',
          company: data.company || '',
          role: data.role || '',
          department: data.department || '',
          decisionMaker: data.decisionMaker || '',
          pitchRecommendation: data.pitchRecommendation || '',
          trendingInsights: Array.isArray(data.trendingInsights) ? data.trendingInsights : [],
          competitorPrices: data.competitorPrices || '',
          demandTimeframe: data.demandTimeframe || '',
          rating: data.rating ?? 0,
          reviewsCount: data.reviewsCount || 0,
          status: data.status || 'new',
          notes: data.notes || '',
          cnpj: data.cnpj || '',
          establishmentPhone: data.establishmentPhone || '',
          whatsapp: data.whatsapp || '',
          decisionMakerPhone: data.decisionMakerPhone || '',
          legalSource: data.legalSource || '',
          // 🆕 Campos da Casa dos Dados + Apify (antes eram descartados!)
          tem_whatsapp: data.tem_whatsapp ?? null,
          telefone_receita: data.telefone_receita || null,
          razao_social: data.razao_social || null,
          nome_fantasia: data.nome_fantasia || null,
          socios: Array.isArray(data.socios) ? data.socios : [],
          match_score: data.match_score ?? null,
          website: data.website || null,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
          updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || Date.now()),
        };
      });
      onUpdate(contacts);
    },
    (error) => {
      console.error('Firestore subscription error:', error);
      if (onError) onError(error);
    }
  );
}

export async function addContactToFirestore(
  userId: string,
  contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const result = await mutateCrm(userId, {action: 'saveContacts', contacts: [contact]});
  if (!result.ids?.[0]) throw new Error('Gravação do contato não confirmada.');
  return result.ids[0];
}

export async function batchAddContactsToFirestore(
  userId: string,
  contacts: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<void> {
  for (let offset = 0; offset < contacts.length; offset += 10) {
    await mutateCrm(userId, {action: 'saveContacts', contacts: contacts.slice(offset, offset + 10)});
  }
}

export async function updateContactInFirestore(userId: string, contactId: string, data: Partial<Contact>): Promise<void> {
  await mutateCrm(userId, {action: 'updateContact', id: contactId, data});
}

export async function deleteContactFromFirestore(userId: string, contactId: string): Promise<void> {
  await mutateCrm(userId, {action: 'deleteContacts', ids: [contactId]});
}

export async function batchDeleteContacts(userId: string, contactIds: string[]): Promise<void> {
  for (let offset = 0; offset < contactIds.length; offset += 400) {
    await mutateCrm(userId, {action: 'deleteContacts', ids: contactIds.slice(offset, offset + 400)});
  }
}
