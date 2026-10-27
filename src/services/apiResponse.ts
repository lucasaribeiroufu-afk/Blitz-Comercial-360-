/** Keep deployment failures explicit without exposing raw HTML or credentials. */
export async function readApiResponse(response: Response, route: string): Promise<any> {
  const contentType = response.headers.get('content-type') || 'ausente';
  const body = await response.text();
  const context = `${route}: HTTP ${response.status}; Content-Type: ${contentType}`;
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    const code = body.match(/\b(?:FUNCTION_INVOCATION_FAILED|FUNCTION_INVOCATION_TIMEOUT|DEPLOYMENT_NOT_FOUND|DEPLOYMENT_DISABLED|NOT_FOUND)\b/)?.[0];
    const detail = code ? ` Código da hospedagem: ${code}.` : /^\s*(?:<!doctype\s+html|<html)/i.test(body) ? ' A rota retornou HTML em vez de dados da API.' : ' A resposta não contém JSON válido.';
    throw new Error(`${context}.${response.redirected ? ' A requisição foi redirecionada.' : ''}${detail} Verifique os Runtime Logs da função na Vercel.`);
  }
  if (!response.ok) {
    throw new Error(`${context}. ${typeof data?.error === 'string' ? data.error : 'Falha na API; consulte os Runtime Logs.'}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${context}. Resposta da API em formato inesperado.`);
  }
  return data;
}
