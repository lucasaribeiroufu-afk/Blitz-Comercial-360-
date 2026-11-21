import { auth } from '../lib/firebase';
import { apiHeaders } from './apiAuth';
import { readApiResponse } from './apiResponse';

export async function mutateCrm(userId: string, body: object): Promise<{ids?: string[]; ok?: boolean}> {
  if (!userId || auth.currentUser?.uid !== userId) throw new Error('Entre na conta responsável por estes registros.');
  const response = await fetch('/api/crm', {
    method: 'POST', headers: await apiHeaders(), body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });
  return readApiResponse(response, '/api/crm');
}
