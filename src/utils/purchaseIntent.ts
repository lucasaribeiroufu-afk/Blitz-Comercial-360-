/**
 * Utility to detect clear purchase intent and procurement needs in contact observation / notes.
 */

export function hasPurchaseIntent(notes?: string): boolean {
  if (!notes || typeof notes !== 'string') return false;

  const normalized = notes
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const intentKeywords = [
    'compra',
    'comprar',
    'comprador',
    'compradora',
    'compradores',
    'aquisicao',
    'aquisicoes',
    'suprimento',
    'suprimentos',
    'cotacao',
    'cotacoes',
    'insumo',
    'insumos',
    'necessidade',
    'urgente',
    'urgencia',
    'demanda',
    'procura',
    'procurado',
    'procurados',
    'buscando',
    'safra',
    'pedido',
    'fornecimento',
    'fornecedor',
    'licitacao',
    'licitacoes',
    'clarificante',
    'reposicao',
    'objetivo',
    'intencao',
    'alerta',
    'precisando',
    'interesse',
    'orcamento',
  ];

  return intentKeywords.some((keyword) => normalized.includes(keyword));
}
