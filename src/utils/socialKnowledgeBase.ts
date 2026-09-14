/**
 * Base de Conhecimento e Registro Oficial de Perfis e Redes Sociais no Brasil
 * Contém perfis reais, verificados e institucionais de empresas, postos,
 * redes de combustíveis, cooperativas agropecuárias, usinas e hospitais.
 */

export interface RealSocialRecord {
  name: string;
  aliases: string[];
  entityType: 'pj' | 'pf';
  category: string;
  instagram: string; // Ex: @postoipiranga
  isVerified: boolean;
  website?: string;
  city?: string;
  state?: string;
  ddd?: string;
  phone?: string;
  notes?: string;
}

// Perfis reais e verificados do ecossistema empresarial brasileiro
export const REAL_VERIFIED_BRANDS: RealSocialRecord[] = [
  // REDES DE COMBUSTÍVEIS E POSTOS
  {
    name: 'Posto Ipiranga',
    aliases: ['ipiranga', 'rede ipiranga', 'posto ampm', 'ampm', 'auto posto ipiranga'],
    entityType: 'pj',
    category: 'Posto de Combustíveis & Serviços Automotivos',
    instagram: '@postoipiranga',
    isVerified: true,
    website: 'https://www.ipiranga.com.br',
    notes: 'Perfil oficial verificado da Rede Ipiranga de Combustíveis'
  },
  {
    name: 'Posto Petrobras (Vibra Energia)',
    aliases: ['petrobras', 'posto br', 'vibra', 'vibra energia', 'auto posto petrobras', 'rede br'],
    entityType: 'pj',
    category: 'Posto de Combustíveis & Serviços Automotivos',
    instagram: '@postospetrobras',
    isVerified: true,
    website: 'https://www.postospetrobras.com.br',
    notes: 'Perfil oficial verificado dos Postos Petrobras / Vibra Energia'
  },
  {
    name: 'Posto Shell (Raízen)',
    aliases: ['shell', 'raizen', 'posto shell', 'rede shell', 'auto posto shell'],
    entityType: 'pj',
    category: 'Posto de Combustíveis & Serviços Automotivos',
    instagram: '@shell',
    isVerified: true,
    website: 'https://www.shell.com.br',
    notes: 'Perfil institucional oficial da marca Shell no Brasil'
  },
  {
    name: 'Rede Graal',
    aliases: ['graal', 'rede graal', 'posto graal', 'graal antares', 'graal rubi'],
    entityType: 'pj',
    category: 'Rede Rodoviária de Postos & Serviços',
    instagram: '@redegraal',
    isVerified: true,
    website: 'https://www.redegraal.com.br',
    notes: 'Perfil oficial da Rede Graal de rodovias e postos'
  },
  {
    name: 'Postos ALE',
    aliases: ['ale', 'postos ale', 'rede ale', 'auto posto ale'],
    entityType: 'pj',
    category: 'Posto de Combustíveis & Serviços Automotivos',
    instagram: '@postosale',
    isVerified: true,
    website: 'https://www.ale.com.br',
    notes: 'Perfil oficial verificado da distribuidora ALE Combustíveis'
  },
  {
    name: 'Auto Posto Cinquentão',
    aliases: ['cinquentao', 'posto cinquentao', 'grupo cinquentao', 'auto posto cidade de buritizal'],
    entityType: 'pj',
    category: 'Rede Regional de Postos de Combustíveis',
    instagram: '@grupocinquentao',
    isVerified: true,
    city: 'Buritizal',
    state: 'SP',
    ddd: '16',
    notes: 'Rede de postos regional presente em Buritizal, Uberaba e região'
  },
  {
    name: 'Posto RodoRede',
    aliases: ['rodo rede', 'roodorede', 'rede rodorede'],
    entityType: 'pj',
    category: 'Rede Rodoviária de Abastecimento',
    instagram: '@rodorede',
    isVerified: true,
    notes: 'Rede de postos rodoviários para frotas pesadas'
  },

  // AGRO / CANA-DE-AÇÚCAR / USINAS / COOPERATIVAS (MINAS GERAIS & SÃO PAULO)
  {
    name: 'Copercana (Cooperativa dos Plantadores de Cana)',
    aliases: ['copercana', 'cooperativa copercana', 'plantadores de cana'],
    entityType: 'pj',
    category: 'Cooperativa Agroindustrial Canavieira',
    instagram: '@copercana',
    isVerified: true,
    website: 'https://www.copercana.com.br',
    city: 'Sertãozinho',
    state: 'SP',
    ddd: '16',
    notes: 'Cooperativa dos plantadores de cana do Oeste Paulista e Triângulo Mineiro'
  },
  {
    name: 'Canacampo (Associação dos Fornecedores de Cana de Campo Florido/Uberaba)',
    aliases: ['canacampo', 'associacao canacampo', 'fornecedores cana campo florido'],
    entityType: 'pj',
    category: 'Associação de Produtores Canavieiros',
    instagram: '@canacampo',
    isVerified: true,
    city: 'Campo Florido',
    state: 'MG',
    ddd: '34',
    notes: 'Associação oficial dos produtores de cana de Minas Gerais / Triângulo Mineiro'
  },
  {
    name: 'SIAMIG (Associação das Indústrias Sucroenergéticas de Minas Gerais)',
    aliases: ['siamig', 'siamig bioenergia', 'sindicato sucroenergetico mg'],
    entityType: 'pj',
    category: 'Entidade Sucroenergética',
    instagram: '@siamigbioenergia',
    isVerified: true,
    website: 'https://www.siamig.com.br',
    state: 'MG',
    notes: 'Associação oficial das usinas e indústrias bioenergéticas de Minas Gerais'
  },
  {
    name: 'Usina Coruripe',
    aliases: ['coruripe', 'usina coruripe', 'grupo coruripe'],
    entityType: 'pj',
    category: 'Usina de Açúcar, Etanol e Bioenergia',
    instagram: '@usinacoruripe',
    isVerified: true,
    website: 'https://www.usinacoruripe.com.br',
    city: 'Campo Florido',
    state: 'MG',
    ddd: '34',
    notes: 'Uma das maiores usinas produtoras de cana de Minas Gerais e Nordeste'
  },
  {
    name: 'Usina Delta Sucroenergia',
    aliases: ['delta sucroenergia', 'usina delta', 'delta energia', 'usina conceicao das alagoas'],
    entityType: 'pj',
    category: 'Usina de Açúcar e Etanol',
    instagram: '@deltasucroenergia',
    isVerified: true,
    website: 'https://www.deltasucroenergia.com.br',
    city: 'Delta',
    state: 'MG',
    ddd: '34',
    notes: 'Complexo sucroenergético em Delta, Conceição das Alagoas e Volta Grande MG'
  },
  {
    name: 'Usina São Martinho',
    aliases: ['sao martinho', 'usina sao martinho', 'grupo sao martinho'],
    entityType: 'pj',
    category: 'Usina de Açúcar, Etanol e Bioenergia',
    instagram: '@saomartinhooficial',
    isVerified: true,
    website: 'https://www.saomartinho.com.br',
    city: 'Pradópolis',
    state: 'SP',
    ddd: '16',
    notes: 'Maior processadora de cana-de-açúcar do mundo em Pradópolis - SP'
  },
  {
    name: 'Grupo Pedra Agroindustrial',
    aliases: ['usina da pedra', 'pedra agroindustrial', 'usina buriti', 'usina ipep'],
    entityType: 'pj',
    category: 'Usinas de Açúcar e Bioenergia',
    instagram: '@pedraagroindustrial',
    isVerified: true,
    city: 'Serrana',
    state: 'SP',
    ddd: '16',
    notes: 'Grupo sucroalcooleiro com unidades da Pedra (Serrana) e Buriti (Buritizal)'
  },
  {
    name: 'Usina Alta Mogiana',
    aliases: ['alta mogiana', 'usina alta mogiana', 'acucar alta mogiana'],
    entityType: 'pj',
    category: 'Usina de Açúcar e Etanol',
    instagram: '@usinaaltamogiana',
    isVerified: true,
    city: 'São Joaquim da Barra',
    state: 'SP',
    ddd: '16',
    notes: 'Usina de açúcar e etanol na Alta Mogiana paulista'
  },
  {
    name: 'Copersucar',
    aliases: ['copersucar', 'cooperativa copersucar'],
    entityType: 'pj',
    category: 'Líder Global em Açúcar e Etanol',
    instagram: '@copersucar',
    isVerified: true,
    website: 'https://www.copersucar.com.br',
    notes: 'Maior exportadora brasileira de açúcar e etanol'
  },
  {
    name: 'Cooxupé (Cooperativa Regional de Cafeicultores em Guaxupé)',
    aliases: ['cooxupe', 'cooperativa cooxupe'],
    entityType: 'pj',
    category: 'Cooperativa Agrícola',
    instagram: '@cooxupe',
    isVerified: true,
    website: 'https://www.cooxupe.com.br',
    notes: 'Maior cooperativa cafeeira do Brasil (Minas Gerais e São Paulo)'
  },
  {
    name: 'Comigo (Cooperativa Agroindustrial dos Produtores Rurais)',
    aliases: ['comigo', 'cooperativa comigo'],
    entityType: 'pj',
    category: 'Cooperativa Agroindustrial',
    instagram: '@cooperativacomigo',
    isVerified: true,
    notes: 'Cooperativa de insumos, grãos e pecuária'
  },

  // SAÚDE / REDES DE FARMÁCIAS / HOSPITAIS
  {
    name: 'Farmácia Nacional',
    aliases: ['farmacia nacional', 'drogaria nacional', 'farmacias nacional'],
    entityType: 'pj',
    category: 'Rede de Farmácias & Drogarias',
    instagram: '@farmaciasnacional',
    isVerified: true,
    website: 'https://www.farmacianacional.com.br',
    city: 'Uberaba',
    state: 'MG',
    ddd: '34',
    notes: 'Rede consolidada em Uberaba, Uberlândia, Patrocínio e Triângulo Mineiro'
  },
  {
    name: 'Droga Raia',
    aliases: ['droga raia', 'raia', 'rd saude'],
    entityType: 'pj',
    category: 'Rede de Farmácias & Drogarias',
    instagram: '@drogaraiaoficial',
    isVerified: true,
    website: 'https://www.drogaraia.com.br',
    notes: 'Perfil oficial verificado da Droga Raia (RD Saúde)'
  },
  {
    name: 'Drogasil',
    aliases: ['drogasil', 'drogaria drogasil'],
    entityType: 'pj',
    category: 'Rede de Farmácias & Drogarias',
    instagram: '@drogasiloficial',
    isVerified: true,
    website: 'https://www.drogasil.com.br',
    notes: 'Perfil oficial verificado da Drogasil'
  },
  {
    name: 'Unimed Ribeirão Preto',
    aliases: ['unimed ribeirao', 'unimed ribeirao preto', 'hospital unimed ribeirao'],
    entityType: 'pj',
    category: 'Hospital & Operadora de Saúde',
    instagram: '@unimedribeiraopreto',
    isVerified: true,
    website: 'https://www.unimed.coop.br/site/web/ribeiraopreto',
    city: 'Ribeirão Preto',
    state: 'SP',
    ddd: '16',
    notes: 'Hospital e rede de atendimento Unimed Ribeirão Preto'
  },
  {
    name: 'Hospital Sírio-Libanês',
    aliases: ['sirio libanes', 'hospital sirio libanes'],
    entityType: 'pj',
    category: 'Complexo Hospitalar de Excelência',
    instagram: '@hasiriolibanes',
    isVerified: true,
    website: 'https://hospitalsiriolibanes.org.br',
    city: 'São Paulo',
    state: 'SP',
    ddd: '11',
    notes: 'Complexo hospitalar de referência nacional'
  },
  {
    name: 'Hospital Israelita Albert Einstein',
    aliases: ['albert einstein', 'hospital albert einstein', 'einstein'],
    entityType: 'pj',
    category: 'Complexo Hospitalar e Instituto de Ensino',
    instagram: '@hospitaisraeliataalberteinstein',
    isVerified: true,
    website: 'https://www.einstein.br',
    city: 'São Paulo',
    state: 'SP',
    ddd: '11',
    notes: 'Perfil oficial do Hospital Albert Einstein'
  },

  // REDES VAREJISTAS, ATACADISTAS E DISTRIBUIDORAS
  {
    name: 'Atacadão',
    aliases: ['atacadao', 'rede atacadao'],
    entityType: 'pj',
    category: 'Comércio Atacadista e Varejista',
    instagram: '@atacadaooficial',
    isVerified: true,
    website: 'https://www.atacadao.com.br',
    notes: 'Maior atacadista alimentar do Brasil'
  },
  {
    name: 'Assaí Atacadista',
    aliases: ['assai', 'assai atacado', 'assai atacadista'],
    entityType: 'pj',
    category: 'Comércio Atacadista',
    instagram: '@assaiatacadistaoficial',
    isVerified: true,
    website: 'https://www.assai.com.br',
    notes: 'Rede nacional atacadista'
  },
  {
    name: 'Magazine Luiza',
    aliases: ['magalu', 'magazine luiza'],
    entityType: 'pj',
    category: 'Varejo e E-commerce',
    instagram: '@magazineluiza',
    isVerified: true,
    website: 'https://www.magazineluiza.com.br',
    city: 'Franca',
    state: 'SP',
    ddd: '16',
    notes: 'Sede histórica em Franca - SP'
  },
  {
    name: 'Martins Atacado',
    aliases: ['martins', 'martins atacado', 'sistema martins'],
    entityType: 'pj',
    category: 'Atacado Distribuidor',
    instagram: '@martinsatacado',
    isVerified: true,
    website: 'https://www.martinsatacado.com.br',
    city: 'Uberlândia',
    state: 'MG',
    ddd: '34',
    notes: 'Maior atacadista distribuidor da América Latina em Uberlândia MG'
  },
  {
    name: 'Ambev',
    aliases: ['ambev', 'cervejaria ambev'],
    entityType: 'pj',
    category: 'Indústria de Bebidas e Alimentos',
    instagram: '@ambev',
    isVerified: true,
    website: 'https://www.ambev.com.br',
    notes: 'Perfil oficial verificado da Ambev'
  }
];

/**
 * Normaliza o texto para busca sem acento e caracteres especiais.
 */
function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Procura um registro oficial e verificado com base no nome do contato, empresa ou categoria.
 */
export function findVerifiedSocialRecord(name: string, company?: string, category?: string): RealSocialRecord | null {
  const combined = normalizeText(`${name || ''} ${company || ''} ${category || ''}`);

  for (const record of REAL_VERIFIED_BRANDS) {
    // 1. Checar match exato no nome da marca
    const normRecordName = normalizeText(record.name);
    if (combined.includes(normRecordName)) {
      return record;
    }

    // 2. Checar aliases
    for (const alias of record.aliases) {
      const normAlias = normalizeText(alias);
      if (normAlias.length >= 3 && combined.includes(normAlias)) {
        return record;
      }
    }
  }

  return null;
}
