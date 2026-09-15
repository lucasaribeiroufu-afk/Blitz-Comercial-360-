import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
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
          profileUrl: data.profileUrl || '',
          phone: data.phone || '',
          email: data.email || '',
          location: data.location || 'Brasil',
          platform: data.platform || 'google_maps',
          category: data.category || '',
          company: data.company || '',
          role: data.role || '',
          department: data.department || '',
          decisionMaker: data.decisionMaker || '',
          pitchRecommendation: data.pitchRecommendation || '',
          trendingInsights: Array.isArray(data.trendingInsights) ? data.trendingInsights : [],
          competitorPrices: data.competitorPrices || '',
          demandTimeframe: data.demandTimeframe || 'Últimos 7 dias (Ativo)',
          rating: data.rating || 4.8,
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

/**
 * Recursively cleans an object to remove undefined values, which are rejected by Firestore.
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export async function addContactToFirestore(
  userId: string,
  contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  if (!userId) throw new Error('Usuário não autenticado');

  const contactsRef = collection(db, 'users', userId, 'contacts');
  const cleaned = cleanForFirestore(contact);
  const docRef = await addDoc(contactsRef, {
    ...cleaned,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function batchAddContactsToFirestore(
  userId: string,
  contacts: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<void> {
  if (!userId || contacts.length === 0) return;

  const batch = writeBatch(db);
  const contactsRef = collection(db, 'users', userId, 'contacts');

  contacts.forEach((c) => {
    const newDocRef = doc(contactsRef);
    const cleaned = cleanForFirestore(c);
    batch.set(newDocRef, {
      ...cleaned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function updateContactInFirestore(
  userId: string,
  contactId: string,
  data: Partial<Contact>
): Promise<void> {
  if (!userId || !contactId) throw new Error('Dados inválidos');

  const contactRef = doc(db, 'users', userId, 'contacts', contactId);
  const cleanData: Record<string, any> = cleanForFirestore(data);
  delete cleanData.id;
  delete cleanData.createdAt;
  cleanData.updatedAt = serverTimestamp();

  await updateDoc(contactRef, cleanData);
}

export async function deleteContactFromFirestore(
  userId: string,
  contactId: string
): Promise<void> {
  if (!userId || !contactId) throw new Error('Dados inválidos');

  const contactRef = doc(db, 'users', userId, 'contacts', contactId);
  await deleteDoc(contactRef);
}

export async function batchDeleteContacts(
  userId: string,
  contactIds: string[]
): Promise<void> {
  if (!userId || contactIds.length === 0) return;

  const CHUNK_SIZE = 400;
  for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      const contactRef = doc(db, 'users', userId, 'contacts', id);
      batch.delete(contactRef);
    });
    await batch.commit();
  }
}
