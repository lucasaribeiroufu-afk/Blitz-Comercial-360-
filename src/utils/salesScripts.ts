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

/**
 * Gera scripts de abordagem via WhatsApp sob medida para o contato selecionado
 */
export function getSalesScriptsForContact(contact: Contact, sellerName: string = 'Consultor'): SalesScriptOption[] {
  const firstName = contact.name.split(' ')[0] || 'Cliente';
  const cleanPhone = contact.phone.replace(/\D/g, '');
  const productInfo = contact.trendingInsights && contact.trendingInsights.length > 0 
    ? parseProductInsight(contact.trendingInsights[0]) 
    : { productName: contact.category || 'produtos da sua categoria', destinationSite: '' };
  
  const companyName = contact.company || contact.name;
  const decisionMaker = contact.decisionMaker || firstName;

  return [
    {
      id: 'urgency_delivery',
      title: 'Pronta Entrega & Atendimento Imediato (Hoje)',
      category: 'urgency',
      iconName: 'Zap',
      badge: 'Alta Conversão para Hoje',
      preview: `Olá ${firstName}, tudo bem? Temos disponibilidade imediata de ${productInfo.productName}...`,
      generateText: (c, s = sellerName) => {
        return `Olá, *${firstName}*! Tudo bem? Aqui é o ${s}.\n\nNotei que sua empresa (*${companyName}*) atua forte com *${productInfo.productName}*. Temos um lote com *pronta entrega e envio imediato hoje*, sem a espera de marketplaces.\n\nPodemos fechar o pedido hoje com condição especial de entrega? Me avise se você tem alguns minutos para eu te passar a cotação sem compromisso! 📦`;
      }
    },
    {
      id: 'price_shipping',
      title: 'Melhor Preço com Frete Incluso (Bater Concorrente / CIF)',
      category: 'price',
      iconName: 'DollarSign',
      badge: 'Foco em Economia / CIF',
      preview: `Olá ${firstName}, conseguimos cobrir cotações de ${productInfo.productName} com frete incluso...`,
      generateText: (c, s = sellerName) => {
        const competitorNote = c.competitorPrices ? ` (Mapeamos concorrentes e garantimos preço mais competitivo)` : '';
        return `Olá *${firstName}*, tudo bem? Sou o ${s}.\n\nEstou com uma condição exclusiva para fornecimento de *${productInfo.productName}* para a *${companyName}*:${competitorNote}\n\n✅ Preço direto de distribuidor / atacado\n✅ *Opções com Frete CIF (Incluso na porta) ou FOB (Retirada)*\n✅ Faturamento flexível no PIX com desconto ou Boleto PJ\n\nQual a quantidade média que você costuma repor por mês? Posso calcular sua economia agora mesmo!`;
      }
    },
    {
      id: 'decision_maker_pitch',
      title: 'Abordagem Direta para Gerente de Compras / Decisor',
      category: 'decision_maker',
      iconName: 'UserCheck',
      badge: 'Contato Corporativo B2B',
      preview: `Olá ${decisionMaker}, você é o responsável pelas cotações de ${productInfo.productName}?`,
      generateText: (c, s = sellerName) => {
        return `Olá, *${decisionMaker}*! Tudo bem?\n\nAqui é o ${s}. Estou entrando em contato direto com você na *${companyName}* pois somos especialistas no fornecimento de *${productInfo.productName}*.\n\nSei que seu tempo é corrido, então quero ser direto: temos condições comerciais diferenciadas para empresas do seu porte, com garantia de procedência e nota fiscal imediata.\n\nVocê teria 2 minutos hoje para receber nossa tabela comparativa?`;
      }
    },
    {
      id: 'quick_direct',
      title: 'Mensagem Curta e Objetiva (WhatsApp Rápido)',
      category: 'short_direct',
      iconName: 'MessageSquare',
      badge: 'Resposta Rápida',
      preview: `Oi ${firstName}, vocês estão cotando ${productInfo.productName} essa semana?`,
      generateText: (c, s = sellerName) => {
        return `Oi, *${firstName}*! Tudo bem? ${s} por aqui.\n\nVocês na *${companyName}* estão cotando ou repondo estoque de *${productInfo.productName}* essa semana? Temos uma condição diferenciada pronta para despacho.`;
      }
    },
    {
      id: 'followup_warm',
      title: 'Follow-up de Acompanhamento (Recontato)',
      category: 'followup',
      iconName: 'Clock',
      badge: 'Reaquecer Contato',
      preview: `Olá ${firstName}, passando para ver se conseguiu avaliar a proposta de ${productInfo.productName}...`,
      generateText: (c, s = sellerName) => {
        return `Olá *${firstName}*, tudo bem? Passando rapidamente para saber se conseguiu dar uma olhada na nossa condição para *${productInfo.productName}*.\n\nConsigo segurar a tabela com o frete incluso até o final da semana para você. Conseguimos avançar?`;
      }
    }
  ];
}

/**
 * Matriz tática completa de quebra de objeções (Mais de 20 respostas prontas para rejeição mais comum)
 */
export const OBJECTION_HANDBOOK: ObjectionItem[] = [
  {
    id: 'obj_1',
    objection: '"Já tenho um fornecedor fixo e estou satisfeito."',
    category: 'fornecedor',
    solutionSummary: 'Não dispute o fornecedor atual. Proponha ser o fornecedor "reserva de emergência" com um pedido de teste menor.',
    scriptResponse: 'Perfeito, entendemos e respeitamos sua parceria atual! Não queremos que você troque de fornecedor agora, apenas que tenha uma 2ª opção homologada para emergências ou falta de estoque dele. Que tal fazermos uma cotação de teste em um lote menor sem compromisso para você cadastrar nosso contato?'
  },
  {
    id: 'obj_2',
    objection: '"Achei mais barato no Mercado Livre / Shopee / Internet."',
    category: 'preco',
    solutionSummary: 'Destaque que preços de marketplace muitas vezes não incluem frete real, demoram para despachar e não emitem NF para PJ com garantia direta.',
    scriptResponse: 'Muitas vezes esses anúncios na internet parecem mais baratos, mas ao calcular o frete pesado para a sua região ou exigir Nota Fiscal com faturamento PJ e garantia de reposição imediata, o valor final sobe. Nós já cotamos com frete incluso e suporte direto comigo no WhatsApp.'
  },
  {
    id: 'obj_3',
    objection: '"O frete para a minha região está ficando muito caro."',
    category: 'frete',
    solutionSummary: 'Ofereça a política de frete incluso (CIF) ou opção de retirada FOB caso ele tenha transportadora própria.',
    scriptResponse: 'Entendo perfeitamente! Justamente por isso nós trabalhamos com duas modalidades: no frete CIF nós consolidamos a carga e absorvemos o custo do frete no pedido mínimo, ou se você tiver convênio com transportadora, liberamos na modalidade FOB com desconto direto no produto!'
  },
  {
    id: 'obj_4',
    objection: '"Só compramos com prazo faturado no boleto em 30/60 dias."',
    category: 'prazo',
    solutionSummary: 'Mostre flexibilidade mediante aprovação cadastral rápida ou ofereça desconto à vista no PIX que compense a diferença.',
    scriptResponse: 'Compreendo! Nós atendemos faturamento no boleto para empresas com CNPJ ativo mediante cadastro simples. E caso você prefira economizar no caixa, temos também a opção com 5% a 8% de desconto adicional no PIX. O que fica mais confortável para o seu financeiro?'
  },
  {
    id: 'obj_5',
    objection: '"Preciso ver com o meu sócio / gerente / diretoria."',
    category: 'decisao',
    solutionSummary: 'Facilite a vida do interlocutor enviando um resumo executivo com comparativo para ele apenas repassar.',
    scriptResponse: 'Totalmente compreensível! Para facilitar a sua conversa com eles, vou te mandar aqui no WhatsApp um resumo executivo com os valores, comparativo FOB x CIF e fotos do lote. Assim você só precisa encaminhar. Posso mandar em 2 minutos?'
  },
  {
    id: 'obj_6',
    objection: '"Não estamos comprando nada agora / nosso estoque está cheio."',
    category: 'timing',
    solutionSummary: 'Identifique o ciclo de reposição e agende follow-up com antecedência, oferecendo travamento de preço.',
    scriptResponse: 'Sem problemas, ótima notícia que o estoque está em dia! Quando vocês estimam fazer a próxima reposição? Posso deixar sua empresa cadastrada na nossa tabela de atacado e te mandar uma mensagem 3 dias antes com as condições travadas.'
  },
  {
    id: 'obj_7',
    objection: '"Me manda a tabela completa por e-mail que eu analiso."',
    category: 'decisao',
    solutionSummary: 'Evite o cemitério de e-mails. Descubra os 2 ou 3 itens mais urgentes e envie uma cotação cirúrgica no WhatsApp.',
    scriptResponse: 'Claro, posso mandar sim! Mas como nossa tabela tem dezenas de itens com variações de lote e frete, quais são os 2 produtos que você mais consome ou que estão com preço apertado hoje? Assim eu já te mando uma cotação cirúrgica com o melhor preço final.'
  },
  {
    id: 'obj_8',
    objection: '"O preço de vocês está mais alto do que eu pago hoje."',
    category: 'preco',
    solutionSummary: 'Analise se a cotação comparada é com frete incluso (CIF), impostos inclusos e garantia de procedência.',
    scriptResponse: 'Entendi! O valor que você paga hoje já inclui o frete CIF entregue na sua porta com seguro e nota fiscal de distribuidor oficial? Muitas vezes a cotação parece mais baixa na base, mas com frete e taxas ultrapassa nosso valor. Me passa a referência que cubro o frete para você.'
  },
  {
    id: 'obj_9',
    objection: '"Nunca ouvi falar da empresa de vocês / falta de confiança."',
    category: 'confianca',
    solutionSummary: 'Apresente dados cadastrais, CNPJ regular, clientes atendidos na região e proposta de primeiro pedido menor.',
    scriptResponse: 'Excelente cautela, no mercado atual segurança é fundamental! Nós operamos com CNPJ regularizado, emissão imediata de NF-e e já fornecemos para diversas empresas do setor na sua região. Podemos começar com um pedido piloto de menor volume para você testar nossa agilidade.'
  },
  {
    id: 'obj_10',
    objection: '"Não temos cadastro nem limite de crédito aprovado com vocês."',
    category: 'prazo',
    solutionSummary: 'Explique que o cadastro é simplificado, via cartão CNPJ e aprovação em menos de 2 horas.',
    scriptResponse: 'Nosso processo cadastral é 100% digital e desburocratizado! Você só precisa me enviar o Cartão CNPJ e a referência de faturamento que aprovamos o limite em até 2 horas úteis, sem papelada demorada.'
  },
  {
    id: 'obj_11',
    objection: '"Já tive problema de atraso na entrega com outros fornecedores."',
    category: 'frete',
    solutionSummary: 'Destaque o rastreamento em tempo real, transportadora parceira com seguro de carga e prazo acordado em contrato.',
    scriptResponse: 'Sei como atraso de entrega prejudica a operação e gera prejuízo. Por isso trabalhamos com frota dedicada e transportadoras com seguro de carga e rastreamento em tempo real. Se o pedido for fechado hoje, despachamos no primeiro horário com previsão cravada na NF.'
  },
  {
    id: 'obj_12',
    objection: '"Não quero trocar de marca / temos homologação rígida."',
    category: 'fornecedor',
    solutionSummary: 'Ofereça fichas técnicas, laudos de conformidade e certificados de garantia compatíveis com a norma exigida.',
    scriptResponse: 'Trabalhamos estritamente com marcas e produtos homologados pelos órgãos reguladores (ANP, ABNT, Inmetro) com laudo de qualidade anexo à nota fiscal. Posso te enviar a ficha técnica para você conferir a compatibilidade com a sua homologação.'
  },
  {
    id: 'obj_13',
    objection: '"O pedido mínimo de vocês é muito alto para o meu giro."',
    category: 'prazo',
    solutionSummary: 'Ofereça flexibilização de volume fracionado na primeira compra ou composição de mix de produtos.',
    scriptResponse: 'Podemos flexibilizar para a sua primeira compra! Em vez de exigir o lote fechado de um único item, você pode mesclar com outros produtos do nosso catálogo para atingir a condição de frete compartilhado. Qual mix faria sentido para você?'
  },
  {
    id: 'obj_14',
    objection: '"Me liga mês que vem / me procure no próximo trimestre."',
    category: 'timing',
    solutionSummary: 'Pergunte o motivo da data futura e trave uma cotação protegida contra reajustes de mercado.',
    scriptResponse: 'Combinado, anotei aqui na agenda! Apenas um alerta: as usinas/distribuidoras sinalizaram novo reajuste para o próximo mês. Se você deixar pré-aprovado conosco agora, consigo travar a tabela atual com entrega programada para o mês que vem. O que acha?'
  },
  {
    id: 'obj_15',
    objection: '"Só compro se você igualar a cotação da distribuidora X."',
    category: 'preco',
    solutionSummary: 'Peça a cotação ou as condições e mostre diferenciais de prazo, condição de pagamento ou bonificação.',
    scriptResponse: 'Me passe o valor exato que te passaram e a condição de frete (FOB ou CIF). Se estiver na mesma especificação, eu negocio com a nossa diretoria comercial agora mesmo para cobrir ou pelo menos bonificar o frete para você!'
  },
  {
    id: 'obj_16',
    objection: '"Já estou amarrado por contrato anual de fornecimento."',
    category: 'fornecedor',
    solutionSummary: 'Pergunte quando o contrato vence e posicione-se para participar da próxima concorrência/cotação.',
    scriptResponse: 'Perfeito! E quando está prevista a renovação desse contrato? Gostaria de deixar nossa documentação cadastrada no setor de compras para quando abrir a concorrência podermos enviar uma proposta competitiva.'
  },
  {
    id: 'obj_17',
    objection: '"Não confio em pagamento antecipado ou PIX na 1ª compra."',
    category: 'confianca',
    solutionSummary: 'Ofereça pagamento na entrega contra apresentação da NF ou faturamento após conferência da mercadoria.',
    scriptResponse: 'Compreendo perfeitamente a sua precaução. Podemos combinar o pagamento no ato da entrega (contra apresentação da mercadoria e conferência da NF pelo seu motorista/estoquista) ou faturamento via boleto após aprovação cadastral.'
  },
  {
    id: 'obj_18',
    objection: '"A qualidade do produto tem garantia e laudo oficial?"',
    category: 'confianca',
    solutionSummary: 'Confirme emissão de laudo técnico de lote com registro e garantia integral de fábrica.',
    scriptResponse: 'Sim! Todo lote sai acompanhado de Laudo de Análise Técnica oficial com número de lote rastreável e garantia total contra qualquer desconformidade. Posso te mandar o laudo do lote atual pelo WhatsApp agora?'
  },
  {
    id: 'obj_19',
    objection: '"Vocês cobrem avarias ou perdas durante o frete rodoviário?"',
    category: 'frete',
    solutionSummary: 'Reforce que todo envio na modalidade CIF conta com seguro RCTR-C completo com reposição imediata.',
    scriptResponse: 'Com certeza! No nosso frete CIF a carga viaja 100% segurada com apólice de seguro de transporte. Caso ocorra qualquer avaria ou extravio no trajeto, nossa empresa faz a reposição imediata sem nenhum custo para você.'
  },
  {
    id: 'obj_20',
    objection: '"Prefiro comprar no atacado local porque pego na hora."',
    category: 'timing',
    solutionSummary: 'Compare o custo-benefício: atacado local cobra margem de varejo muito maior do que direto de distribuidor.',
    scriptResponse: 'A comodidade local é ótima, mas no atacado da cidade você paga a margem do intermediário e perde até 15% a 25% de lucro. Com o nosso envio programado, você recebe na sua porta com preço de distribuidor e aumenta sua margem líquida.'
  },
  {
    id: 'obj_21',
    objection: '"A margem de revenda está muito apertada para esse item."',
    category: 'preco',
    solutionSummary: 'Demonstre a margem real no cálculo FOB vs CIF e como compras consolidadas aumentam o lucro unitário.',
    scriptResponse: 'Justamente por isso que nossa proposta calcula o custo real na ponta do lápis. Com a nossa tabela de escala e frete diluído, seu custo por unidade cai, permitindo que você aumente sua margem bruta em mais de 10% a 18% em relação aos concorrentes.'
  },
  {
    id: 'obj_22',
    objection: '"Não tenho espaço físico para armazenar um lote grande."',
    category: 'prazo',
    solutionSummary: 'Proponha compras com entregas programadas parceladas mantendo o preço do volume fechado.',
    scriptResponse: 'Temos a solução de Entrega Programada: você fecha a condição do lote com preço de grande volume, mas nós fracionamos as entregas semanalmente ou quinzenalmente conforme a sua capacidade de estoque.'
  },
  {
    id: 'obj_23',
    objection: '"Nós já compramos direto da fábrica / usina."',
    category: 'fornecedor',
    solutionSummary: 'Aponte que compras diretas de usina exigem carretas fechadas, pagamento à vista e prazos longos de fila.',
    scriptResponse: 'Excelente! Porém, usinas costumam exigir volumes gigantescos (carretas de 30 mil litros ou carretas fechadas) e prazos longos de carregamento. Nós atendemos com agilidade entrepostos e lotes médios com faturamento flexível que não engessa seu fluxo de caixa.'
  },
  {
    id: 'obj_24',
    objection: '"Deixe seu contato que se eu precisar eu te procuro."',
    category: 'timing',
    solutionSummary: 'Não deixe solto. Ofereça um benefício concreto para uma primeira cotação comparativa agora.',
    scriptResponse: 'Vou deixar sim! Mas me permita apenas te enviar a nossa cotação dos 2 itens mais vendidos hoje. Assim você guarda no seu WhatsApp e quando precisar de uma base rápida de preço já sabe exatamente com quem contar.'
  },
  {
    id: 'obj_25',
    objection: '"Estamos cortando custos e segurando compras neste momento."',
    category: 'preco',
    solutionSummary: 'Posicione sua proposta exatamente como a solução de redução de custos para a empresa dele.',
    scriptResponse: 'Justamente por vocês estarem cortando custos que esse contato é oportuno! Nosso modelo direto consegue reduzir o custo de aquisição atual em até 12%. Não estamos propondo gastar mais, e sim gastar menos no que vocês já são obrigados a comprar.'
  }
];

/**
 * Retorna o melhor horário sugerido de abordagem com base no nicho/categoria
 */
export function getOptimalContactTiming(category?: string, entityType: 'pj' | 'pf' = 'pj'): {
  timeWindow: string;
  bestDay: string;
  reason: string;
  urgencyLevel: 'alta' | 'media' | 'planejada';
} {
  const cat = (category || '').toLowerCase();

  if (cat.includes('constru') || cat.includes('auto') || cat.includes('peça') || cat.includes('oficina') || cat.includes('máquina')) {
    return {
      timeWindow: '08:00 às 10:30',
      bestDay: 'Segunda a Quarta-feira',
      reason: 'Compradores de obras e autopeças fecham reposições logo na abertura do expediente.',
      urgencyLevel: 'alta'
    };
  }

  if (cat.includes('restaurante') || cat.includes('aliment') || cat.includes('mercado') || cat.includes('padaria') || cat.includes('bar')) {
    return {
      timeWindow: '14:30 às 17:00',
      bestDay: 'Terça e Quinta-feira',
      reason: 'Fora do horário de pico de almoço/jantar dos estabelecimentos gastronômicos.',
      urgencyLevel: 'alta'
    };
  }

  if (cat.includes('clínica') || cat.includes('saúde') || cat.includes('estética') || cat.includes('médic')) {
    return {
      timeWindow: '10:00 às 12:00 ou 16:00 às 18:00',
      bestDay: 'Quarta e Quinta-feira',
      reason: 'Janela de intervalos entre atendimentos e recepção.',
      urgencyLevel: 'media'
    };
  }

  if (entityType === 'pf') {
    return {
      timeWindow: '12:00 às 13:30 ou 18:30 às 20:30',
      bestDay: 'Qualquer dia (Melhor: Fim de tarde)',
      reason: 'Horário de almoço e pós-expediente para atendimento pessoal.',
      urgencyLevel: 'media'
    };
  }

  return {
    timeWindow: '09:30 às 11:30 ou 14:00 às 16:30',
    bestDay: 'Terça a Quinta-feira',
    reason: 'Horário nobre de tomada de decisão comercial e compras B2B.',
    urgencyLevel: 'alta'
  };
}
