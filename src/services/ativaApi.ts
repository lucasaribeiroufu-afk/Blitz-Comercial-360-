import {apiHeaders} from './apiAuth';
import {readApiResponse} from './apiResponse';

export async function ativaApi(body: object): Promise<any> {
  const response = await fetch('/api/ativa', {method:'POST', headers:await apiHeaders(),
    body:JSON.stringify(body), signal:AbortSignal.timeout(55000)});
  return readApiResponse(response, '/api/ativa');
}
