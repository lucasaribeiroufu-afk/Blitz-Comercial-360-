import type { Contact } from '../types';
import { parseProductInsight } from './productHelper';

export interface SalesScriptOption {
  id: string;
  title: string;
  category: 'urgency' | 'price' | 'decision_maker' | 'followup' | 'short_direct';
  iconName: string;
  badge: string;
  preview: string;
  generateText: (contact: Contact, sellerName?: string) => string;
}

export interface ObjectionItem {
  id: string;
  objection: string;
  category: 'preco' | 'fornecedor' | 'prazo' | 'decisao' | 'frete' | 'confianca' | 'timing';
  solutionSummary: string;
  scriptResponse: string;
}

/** Rascunhos para revisão pelo vendedor antes de qualquer envio. */
export function getSalesScriptsForContact(contact: Contact, sellerName = 'Consultor'): SalesScriptOption[] {
  const company = contact.company || contact.name || 'sua empresa';
  const product = contact.matchedProduct || (contact.trendingInsights?.[0]
    ? parseProductInsight(contact.trendingInsights[0]).productName
    : contact.category) || 'o produto pesquisado';
  const greeting = `Olá, equipe da ${company}. Aqui é ${sellerName}.`;
  return [
    {
      id: 'urgency_delivery', title: 'Disponibilidade e prazo', category: 'urgency',
      iconName: 'Zap', badge: 'Rascunho para revisão', preview: `Consultar requisitos de ${product}.`,
      generateText: (_contact, seller = sellerName) => `Olá, equipe da ${company}. Aqui é ${seller}. Gostaria de entender os requisitos para avaliar ${product}. Qual quantidade, local de uso e prazo seriam relevantes para vocês? Posso verificar a disponibilidade com nossa equipe.`
    },
    {
      id: 'price_shipping', title: 'Levantamento para cotação', category: 'price',
      iconName: 'DollarSign', badge: 'Condições a confirmar', preview: 'Confirmar especificação, quantidade e destino.',
      generateText: () => `${greeting} Para preparar uma avaliação comercial de ${product}, poderiam informar a especificação, quantidade e destino? Preço, frete, pagamento e prazo serão apresentados após confirmação interna.`
    },
    {
      id: 'decision_maker_pitch', title: 'Compras e avaliação técnica', category: 'decision_maker',
      iconName: 'UserCheck', badge: 'Canal empresarial', preview: 'Identificar a área responsável e a homologação.',
      generateText: () => `${greeting} Gostaria de apresentar ${product} para avaliação. Qual é o canal oficial de suprimentos e quais documentos são exigidos na homologação? Para revestimento de pisos, a avaliação pode envolver manutenção/engenharia, qualidade e segurança do trabalho.`
    },
    {
      id: 'quick_direct', title: 'Primeiro contato', category: 'short_direct',
      iconName: 'MessageSquare', badge: 'Rascunho para revisão', preview: `Verificar interesse em avaliar ${product}.`,
      generateText: () => `${greeting} Existe interesse em receber informações sobre ${product} para avaliação? Qual área e canal empresarial devem receber o material?`
    },
    {
      id: 'followup_warm', title: 'Consulta de interesse', category: 'followup',
      iconName: 'Clock', badge: 'Histórico a conferir', preview: 'Consultar interesse e momento adequado.',
      generateText: () => `${greeting} Gostaria de verificar se há interesse em avaliar ${product} e qual seria o momento adequado. Caso já tenham recebido material nosso, existe alguma informação adicional necessária?`
    }
  ];
}

export const OBJECTION_HANDBOOK: ObjectionItem[] = [
  { id: 'obj_1', objection: 'Já temos fornecedor.', category: 'fornecedor', solutionSummary: 'Consultar o processo de avaliação de fornecedores.', scriptResponse: 'Como funciona a avaliação de novos fornecedores e quando podemos apresentar nossa documentação?' },
  { id: 'obj_2', objection: 'O preço está alto.', category: 'preco', solutionSummary: 'Comparar especificações e condições verificadas.', scriptResponse: 'Podemos conferir a especificação, quantidade e condições da comparação? Vou consultar nossa equipe antes de apresentar qualquer ajuste.' },
  { id: 'obj_3', objection: 'O frete é caro.', category: 'frete', solutionSummary: 'Levantar destino e volume para consultar transporte.', scriptResponse: 'Qual é o destino e o volume previsto? Com esses dados podemos consultar opções de transporte e apresentar o custo para avaliação.' },
  { id: 'obj_4', objection: 'Precisamos de prazo para pagar.', category: 'prazo', solutionSummary: 'Submeter a condição solicitada à aprovação.', scriptResponse: 'Qual condição de pagamento vocês precisam? Vou submetê-la à avaliação comercial e retornar com o que for aprovado.' },
  { id: 'obj_5', objection: 'Preciso consultar a diretoria.', category: 'decisao', solutionSummary: 'Identificar documentos necessários à decisão.', scriptResponse: 'Quais informações técnicas e comerciais a diretoria precisa para avaliar? Podemos organizar o material disponível.' },
  { id: 'obj_6', objection: 'Agora não precisamos.', category: 'timing', solutionSummary: 'Consultar autorização e data para retorno.', scriptResponse: 'Há uma data adequada para retomar o assunto? Podemos registrar o retorno se vocês autorizarem.' },
  { id: 'obj_7', objection: 'Exigimos homologação.', category: 'confianca', solutionSummary: 'Levantar requisitos e conferir documentação disponível.', scriptResponse: 'Qual é o procedimento oficial de homologação? Precisamos conferir os requisitos e a documentação disponível antes de afirmar compatibilidade.' },
  { id: 'obj_8', objection: 'O produto funciona no nosso piso?', category: 'confianca', solutionSummary: 'Condicionar adequação à avaliação técnica.', scriptResponse: 'A adequação depende da documentação do produto, substrato, aderência seco/molhado, gordura, temperatura, higienização, resistência química, cura e segurança. Podemos levantar essas condições para avaliação técnica e definir um teste autorizado.' }
];

export function getOptimalContactTiming(_category?: string, _entityType: 'pj' | 'pf' = 'pj'): {
  timeWindow: string; bestDay: string; reason: string; urgencyLevel: 'alta' | 'media' | 'planejada';
} {
  return {
    timeWindow: 'Confirmar horário comercial publicado',
    bestDay: 'Confirmar com o estabelecimento',
    reason: 'Disponibilidade do responsável ainda precisa ser confirmada.',
    urgencyLevel: 'planejada'
  };
}
