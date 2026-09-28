// ============================================================
// BLITZ 360 — B2C BUYER INTENT ENGINE v19 VERIFIED
// Radar de Compradores Multi-nicho
//
// Objetivo:
// - respeitar exatamente a consulta do usuario
// - localizar manifestacoes PUBLICAS de intencao de compra
// - funcionar em multiplos nichos
// - classificar oportunidades por Buyer Intent Score
// - NAO inventar telefone, Instagram, avaliacao ou reviews
// - exigir evidencia publica verificavel
// - Gemini classifica; Gemini NAO cria leads
// - manter compatibilidade com o frontend atual
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ACTOR_ID = 'apify~facebook-groups-scraper';

// ============================================================
// FACEBOOK — GRUPOS CONFIGURADOS
// ============================================================

const GRUPOS_POR_NICHO = {
  agro: [
    'https://www.facebook.com/groups/1452587048167923/',
    'https://www.facebook.com/groups/241762439745748/',
    'https://www.facebook.com/groups/709798043065462/',
    'https://www.facebook.com/groups/agropecuaria.grupo',
    'https://www.facebook.com/groups/1819571738357642/',
    'https://www.facebook.com/groups/566066187358045/',
    'https://www.facebook.com/groups/207727399758306/',
    'https://www.facebook.com/groups/1993576477637899/',
    'https://www.facebook.com/groups/2253608394913290/',
    'https://www.facebook.com/groups/1783696828448935/',
    'https://www.facebook.com/groups/122164784542624/'
  ]
};

const NOMES_GRUPOS = {
  '1452587048167923': 'Pecuaria Brasil Oficial',
  '241762439745748': 'Gir Leiteiro Tesouro Brasileiro',
  '709798043065462': 'Os Menino da Pecuaria',
  'agropecuaria.grupo': 'Agropecuaria',
  '1819571738357642': 'Agricultura e Pecuaria',
  '566066187358045': 'Pecuaria Forte Brasil',
  '207727399758306': 'Pecuaria no Brasil',
  '1993576477637899': 'O Melhor da Pecuaria Brasil',
  '2253608394913290': 'Pecuaria Leiteira e Corte Brasil',
  '1783696828448935': 'PECUARISTAS BRASIL',
  '122164784542624': 'Pecuaria e Pecuaristas'
};

// ============================================================
// SINAIS DE INTENCAO
// ============================================================

const SINAIS_ALTA_INTENCAO = [
  'quero comprar',
  'preciso comprar',
  'onde comprar',
  'onde encontro',
  'onde achar',
  'estou procurando',
  'to procurando',
  'estou querendo comprar',
  'alguem vende',
  'alguem indica',
  'alguma indicacao',
  'qual comprar',
  'qual devo comprar',
  'qual voces recomendam',
  'qual recomendam',
  'recomendam algum',
  'tem link',
  'manda o link',
  'link para comprar',
  'procuro para comprar'
];

const SINAIS_MEDIA_INTENCAO = [
  'recomendacao',
  'indicacao',
  'vale a pena',
  'qual e melhor',
  'qual o melhor',
  'melhor custo beneficio',
  'custo beneficio',
  'estou pesquisando',
  'pensando em comprar',
  'pretendo comprar',
  'quero trocar',
  'duvida entre',
  'alguem usa',
  'alguem tem',
  'experiencia com'
];

const SINAIS_BAIXA_INTENCAO = [
  'gostei',
  'achei bonito',
  'achei interessante',
  'queria saber',
  'curiosidade',
  'o que acham',
  'opinioes'
];

const PALAVRAS_SPAM = [
  'bitcoin',
  'cripto',
  'forex',
  'day trade',
  'renda extra',
  'ganhe dinheiro',
  'emprestimo pessoal',
  'curso online',
  'e-book'
];

const TERMOS_VENDA = [
  'vendo',
  'vendendo',
  'a venda',
  'promoção',
  'promocao',
  'oferta',
  'compre agora',
  'frete gratis',
  'loja oficial'
];

const REGIAO_POR_ESTADO = {
  mg: 'sudeste',
  sp: 'sudeste',
  rj: 'sudeste',
  es: 'sudeste',

  pr: 'sul',
  sc: 'sul',
  rs: 'sul',

  go: 'centrooeste',
  mt: 'centrooeste',
  ms: 'centrooeste',
  df: 'centrooeste',

  ba: 'nordeste',
  pe: 'nordeste',
  ce: 'nordeste',
  rn: 'nordeste',
  pb: 'nordeste',
  al: 'nordeste',
  se: 'nordeste',
  pi: 'nordeste',
  ma: 'nordeste',

  am: 'norte',
  pa: 'norte',
  ac: 'norte',
  ro: 'norte',
  rr: 'norte',
  ap: 'norte',
  to: 'norte'
};

// ============================================================
// UTILITARIOS
// ============================================================

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitarNumero(valor, min, max) {
  const n = Number(valor);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.min(
    Math.max(n, min),
    max
  );
}

function textoSeguro(valor, limite) {
  const texto = String(valor || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limite) {
    return texto;
  }

  return texto.substring(0, limite);
}

function extrairTelefone(texto) {
  if (!texto) {
    return null;
  }

  const regex =
    /(?:\(?([1-9]{2})\)?\s*)?(9?\d{4})[-\s]?(\d{4})/g;

  const matches =
    String(texto).match(regex);

  if (!matches) {
    return null;
  }

  for (const m of matches) {
    const digits =
      m.replace(/\D/g, '');

    if (
      digits.length >= 10 &&
      digits.length <= 11
    ) {
      const ddd =
        digits.slice(0, 2);

      const dddNumero =
        parseInt(ddd, 10);

      if (
        dddNumero >= 11 &&
        dddNumero <= 99
      ) {
        const numero =
          digits.slice(2);

        if (numero.length === 9) {
          return (
            '(' +
            ddd +
            ') ' +
            numero.slice(0, 5) +
            '-' +
            numero.slice(5)
          );
        }

        if (numero.length === 8) {
          return (
            '(' +
            ddd +
            ') ' +
            numero.slice(0, 4) +
            '-' +
            numero.slice(4)
          );
        }
      }
    }
  }

  return null;
}

// ============================================================
// DETECCAO DE NICHO
// ============================================================

function detectarNicho(query) {
  const q =
    normalizar(query);

  const mapas = [
    {
      nicho: 'casa',
      termos: [
        'casa',
        'achadinho',
        'decoracao',
        'cozinha',
        'banheiro',
        'quarto',
        'sala',
        'organizador',
        'utensilio',
        'panela',
        'lava louca',
        'lava loucas',
        'air fryer',
        'aspirador',
        'robo aspirador',
        'cafeteira',
        'liquidificador',
        'micro ondas',
        'geladeira',
        'fogao',
        'eletrodomestico'
      ]
    },

    {
      nicho: 'beleza',
      termos: [
        'beleza',
        'maquiagem',
        'perfume',
        'cosmetico',
        'skincare',
        'cabelo',
        'secador',
        'chapinha',
        'escova secadora',
        'hidratante',
        'protetor solar'
      ]
    },

    {
      nicho: 'moda',
      termos: [
        'moda',
        'roupa',
        'vestido',
        'blusa',
        'calca',
        'tenis',
        'sapato',
        'bolsa',
        'feminino',
        'masculino'
      ]
    },

    {
      nicho: 'eletronicos',
      termos: [
        'eletronico',
        'celular',
        'iphone',
        'smartphone',
        'notebook',
        'tablet',
        'televisao',
        'tv',
        'fone',
        'smartwatch',
        'monitor',
        'computador'
      ]
    },

    {
      nicho: 'automotivo',
      termos: [
        'carro',
        'moto',
        'automotivo',
        'pneu',
        'capacete',
        'acessorio carro',
        'acessorio moto'
      ]
    },

    {
      nicho: 'agro',
      termos: [
        'gado',
        'bovino',
        'pecuaria',
        'fazenda',
        'boi',
        'vaca',
        'leite',
        'racao',
        'suplemento animal',
        'balanca bovina',
        'bezerro',
        'novilha',
        'touro'
      ]
    },

    {
      nicho: 'agricola',
      termos: [
        'fertilizante',
        'adubo',
        'defensivo',
        'agricola',
        'plantio',
        'safra',
        'soja',
        'milho',
        'herbicida',
        'fungicida'
      ]
    },

    {
      nicho: 'pet',
      termos: [
        'pet',
        'cachorro',
        'gato',
        'cao',
        'areia para gato',
        'racao pet',
        'brinquedo pet'
      ]
    },

    {
      nicho: 'infantil',
      termos: [
        'bebe',
        'infantil',
        'crianca',
        'brinquedo',
        'carrinho de bebe',
        'berco'
      ]
    }
  ];

  for (const mapa of mapas) {
    const encontrou =
      mapa.termos.some(
        function(termo) {
          return (
            q.indexOf(
              normalizar(termo)
            ) !== -1
          );
        }
      );

    if (encontrou) {
      return mapa.nicho;
    }
  }

  // Nunca usar agro como fallback.
  return 'geral';
}

function categoriaLegivel(nicho) {
  const mapa = {
    casa:
      'Casa e Eletrodomesticos',

    beleza:
      'Beleza e Cuidados Pessoais',

    moda:
      'Moda',

    eletronicos:
      'Eletronicos',

    automotivo:
      'Automotivo',

    agro:
      'Agro e Pecuaria',

    agricola:
      'Agricultura',

    pet:
      'Pet',

    infantil:
      'Infantil',

    geral:
      'Outros'
  };

  return (
    mapa[nicho] ||
    'Outros'
  );
}

// ============================================================
// RELEVANCIA E BUYER INTENT
// ============================================================

function contemAlgum(texto, lista) {
  const t =
    normalizar(texto);

  return lista.some(
    function(item) {
      return (
        t.indexOf(
          normalizar(item)
        ) !== -1
      );
    }
  );
}

function relevanciaQuery(texto, query) {
  const t =
    normalizar(texto);

  const q =
    normalizar(query);

  if (!q) {
    return 0;
  }

  if (
    t.indexOf(q) !== -1
  ) {
    return 30;
  }

  const palavras =
    q
      .split(' ')
      .filter(
        function(p) {
          return p.length >= 3;
        }
      );

  if (!palavras.length) {
    return 0;
  }

  const encontradas =
    palavras.filter(
      function(p) {
        return (
          t.indexOf(p) !== -1
        );
      }
    ).length;

  const proporcao =
    encontradas /
    palavras.length;

  if (proporcao >= 0.8) {
    return 25;
  }

  if (proporcao >= 0.5) {
    return 18;
  }

  if (proporcao > 0) {
    return 8;
  }

  return 0;
}

function calcularBuyerIntent(
  texto,
  query
) {
  const t =
    normalizar(texto);

  let score = 0;
  const sinais = [];

  const relevancia =
    relevanciaQuery(
      texto,
      query
    );

  score += relevancia;

  if (
    contemAlgum(
      t,
      SINAIS_ALTA_INTENCAO
    )
  ) {
    score += 45;

    sinais.push(
      'Intencao explicita de compra'
    );

  } else if (
    contemAlgum(
      t,
      SINAIS_MEDIA_INTENCAO
    )
  ) {
    score += 30;

    sinais.push(
      'Pesquisa ativa / consideracao'
    );

  } else if (
    contemAlgum(
      t,
      SINAIS_BAIXA_INTENCAO
    )
  ) {
    score += 12;

    sinais.push(
      'Interesse inicial'
    );
  }

  if (
    /\b(r\$|reais|ate\s+r\$|orcamento|preco|valor|quanto custa)\b/i
      .test(
        String(texto || '')
      )
  ) {
    score += 12;

    sinais.push(
      'Sinal de preco/orcamento'
    );
  }

  if (
    /\b(hoje|agora|essa semana|urgente|logo|este mes)\b/i
      .test(
        normalizar(texto)
      )
  ) {
    score += 8;

    sinais.push(
      'Sinal de urgencia'
    );
  }

  if (
    /\b(link|shopee|mercado livre|amazon|loja|site)\b/i
      .test(
        normalizar(texto)
      )
  ) {
    score += 5;

    sinais.push(
      'Busca por canal de compra'
    );
  }

  // Conteudo claramente de venda nao deve
  // automaticamente virar comprador.
  if (
    contemAlgum(
      t,
      TERMOS_VENDA
    ) &&
    !contemAlgum(
      t,
      SINAIS_ALTA_INTENCAO
    ) &&
    !contemAlgum(
      t,
      SINAIS_MEDIA_INTENCAO
    )
  ) {
    score -= 20;

    sinais.push(
      'Possivel vendedor/oferta'
    );
  }

  score =
    limitarNumero(
      score,
      0,
      100
    );

  let nivel = 'baixa';

  if (score >= 75) {
    nivel = 'alta';

  } else if (score >= 50) {
    nivel = 'media';
  }

  return {
    score: score,
    nivel: nivel,
    sinais: sinais
  };
}

// ============================================================
// LOCALIZACAO
// ============================================================

function classificarLocalizacao(
  texto,
  location
) {
  if (!location) {
    return {
      score: 5,
      tipo_local: 'nacional',
      label_local: '🌎 Nacional',
      location: 'Brasil'
    };
  }

  const textoNorm =
    normalizar(texto);

  const partes =
    String(location)
      .split(',');

  const cidadeAlvo =
    normalizar(
      partes[0] || ''
    );

  const estadoAlvo =
    normalizar(
      partes[1] || ''
    );

  if (
    cidadeAlvo &&
    textoNorm.indexOf(
      cidadeAlvo
    ) !== -1
  ) {
    return {
      score: 15,
      tipo_local: 'cidade',
      label_local:
        '📍 ' + location,
      location: location
    };
  }

  if (
    estadoAlvo &&
    estadoAlvo.length >= 2 &&
    (
      textoNorm.indexOf(
        ' ' +
        estadoAlvo +
        ' '
      ) !== -1 ||
      textoNorm.endsWith(
        ' ' + estadoAlvo
      )
    )
  ) {
    return {
      score: 10,
      tipo_local: 'estado',
      label_local:
        '🏛️ ' +
        estadoAlvo.toUpperCase(),
      location:
        'Estado: ' +
        estadoAlvo.toUpperCase()
    };
  }

  const minhaRegiao =
    REGIAO_POR_ESTADO[
      estadoAlvo
    ] || '';

  if (minhaRegiao) {
    const estadosRegiao =
      Object.keys(
        REGIAO_POR_ESTADO
      ).filter(
        function(e) {
          return (
            REGIAO_POR_ESTADO[e] ===
            minhaRegiao
          );
        }
      );

    for (
      const est
      of estadosRegiao
    ) {
      if (
        textoNorm.indexOf(
          ' ' + est + ' '
        ) !== -1
      ) {
        return {
          score: 7,
          tipo_local:
            'regiao',
          label_local:
            '🗺️ Regiao ' +
            minhaRegiao,
          location:
            'Regiao ' +
            minhaRegiao
        };
      }
    }
  }

  return {
    score: 0,
    tipo_local: 'nacional',
    label_local: '🌎 Nacional',
    location: 'Brasil'
  };
}

// ============================================================
// GRUPOS E DATAS
// ============================================================

function nomeDoGrupo(url) {
  if (!url) {
    return 'Grupo Facebook';
  }

  for (
    const id
    in NOMES_GRUPOS
  ) {
    if (
      url.indexOf(id) !== -1
    ) {
      return (
        NOMES_GRUPOS[id]
      );
    }
  }

  return 'Grupo Facebook';
}

// IMPORTANTE:
// data desconhecida permanece desconhecida.
// A versao anterior podia transformar ausencia
// de data em data atual, criando falsa informacao.

function dataISO(valor) {
  if (!valor) {
    return '';
  }

  try {
    let d;

    if (
      typeof valor ===
        'number' &&
      valor <
        1000000000000
    ) {
      d =
        new Date(
          valor * 1000
        );
    } else {
      d =
        new Date(valor);
    }

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return '';
    }

    return (
      d
        .toISOString()
        .split('T')[0]
    );

  } catch (e) {
    return '';
  }
}

// ============================================================
// BODY DA REQUISICAO
// ============================================================

async function lerBodyRaw(req) {
  if (
    req.body &&
    typeof req.body ===
      'object' &&
    Object.keys(req.body)
      .length > 0
  ) {
    return req.body;
  }

  if (
    req.body &&
    typeof req.body ===
      'string'
  ) {
    try {
      return JSON.parse(
        req.body
      );
    } catch (e) {}
  }

  try {
    const chunks = [];

    for await (
      const chunk of req
    ) {
      chunks.push(
        typeof chunk ===
          'string'
          ? Buffer.from(chunk)
          : chunk
      );
    }

    const rawBody =
      Buffer
        .concat(chunks)
        .toString('utf8');

    if (rawBody) {
      return JSON.parse(
        rawBody
      );
    }

  } catch (e) {}

  return {};
}

// ============================================================
// MODELO DE LEAD
// ============================================================

function montarLead(params) {
  const {
    name,
    phone,
    email,
    instagram,
    location,
    profileUrl,
    platform,
    source,
    sourceUrl,
    text,
    date,
    query,
    nicho,
    intent,
    geo,
    company,
    group,
    verifiedEvidence,
    verificationReason
  } = params;

  const telefone =
    phone ||
    extrairTelefone(text) ||
    '';

  const intentInfo =
    intent ||
    calcularBuyerIntent(
      text,
      query
    );

  const geoInfo =
    geo ||
    classificarLocalizacao(
      text,
      location
    );

  const scoreFinal =
    limitarNumero(
      intentInfo.score +
        (
          geoInfo.score ||
          0
        ),
      0,
      100
    );

  const nivelFinal =
    scoreFinal >= 75
      ? 'alta'
      : scoreFinal >= 50
        ? 'media'
        : 'baixa';

  const trecho =
    textoSeguro(
      text,
      500
    );

  return {
    name:
      textoSeguro(
        name,
        160
      ) ||
      'Oportunidade encontrada',

    // Somente dados efetivamente encontrados.
    phone: telefone,
    email: email || '',
    instagram:
      instagram || '',

    location:
      geoInfo.location ||
      location ||
      'Brasil',

    profileUrl:
      profileUrl ||
      sourceUrl ||
      '',

    platform:
      platform ||
      'website',

    entityType: 'pf',

    company:
      company ||
      source ||
      'Fonte publica',

    category:
      categoriaLegivel(
        nicho
      ),

    decisionMaker:
      'Intencao de compra ' +
      nivelFinal.toUpperCase() +
      ' — ' +
      textoSeguro(
        trecho,
        100
      ),

    department:
      'Radar de Compradores | ' +
      categoriaLegivel(
        nicho
      ),

    legalSource:
      'Origem: conteudo publico encontrado em ' +
      (
        source ||
        'fonte publica'
      ),

    pitchRecommendation:
      nivelFinal === 'alta'
        ? 'Oportunidade de alta intencao. Avalie o contexto original e responda no canal publico em que a pessoa manifestou interesse.'
        : nivelFinal === 'media'
          ? 'Oportunidade em consideracao. Avalie o contexto antes de recomendar produto.'
          : 'Sinal fraco de compra. Prioridade baixa.',

    trendingInsights: [
      '📝 ' +
        textoSeguro(
          trecho,
          180
        ),

      '🎯 Intencao: ' +
        nivelFinal.toUpperCase(),

      '📊 Buyer Intent Score: ' +
        scoreFinal +
        '/100'
    ],

    competitorPrices: '',

    demandTimeframe:
      'Recente',

    // Nunca inventar estrelas/reviews.
    rating: 0,
    reviewsCount: 0,

    confidence:
      scoreFinal,

    score:
      scoreFinal,

    score_atuacao:
      intentInfo.score,

    buyerIntentScore:
      scoreFinal,

    buyerIntentLevel:
      nivelFinal,

    buyerIntentSignals:
      intentInfo.sinais ||
      [],

    tem_telefone:
      !!telefone,

    tipo:
      'buyer_intent',

    grupo:
      group ||
      source ||
      'Fonte publica',

    label_local:
      geoInfo.label_local ||
      '🌎 Nacional',

    tipo_local:
      geoInfo.tipo_local ||
      'nacional',

    date:
      dataISO(date),

    source:
      source ||
      'Fonte publica',

    sourceUrl:
      sourceUrl ||
      profileUrl ||
      '',

    evidenceText:
      trecho,

    verifiedEvidence:
      verifiedEvidence ===
      true,

    verificationReason:
      verificationReason ||
      '',

    intent:
      trecho,

    query:
      query,

    contact:
      telefone ||
      null,

    observacao:
      'Radar de Compradores — dados exibidos somente quando encontrados na fonte publica'
  };
}

// ============================================================
// VERIFICACAO DE EVIDENCIA PUBLICA
// ============================================================

function limparHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function urlPublicaSegura(valor) {
  try {
    const u = new URL(String(valor || ''));

    if (
      !['http:', 'https:'].includes(u.protocol)
    ) {
      return false;
    }

    const host =
      u.hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return false;
    }

    // Bloqueia intervalos IPv4 privados.
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }

    return true;

  } catch (e) {
    return false;
  }
}

async function verificarEvidenciaPublica(
  sourceUrl,
  query,
  textoDescoberto
) {
  if (
    !urlPublicaSegura(
      sourceUrl
    )
  ) {
    return {
      verified: false,
      reason:
        'URL ausente, invalida ou nao publica',
      evidenceText: ''
    };
  }

  try {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        function() {
          controller.abort();
        },
        7000
      );

    const response =
      await fetch(
        sourceUrl,
        {
          method: 'GET',
          redirect: 'follow',

          signal:
            controller.signal,

          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; Blitz360BuyerIntent/19.0; +https://vercel.app)',

            'Accept':
              'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
          }
        }
      );

    clearTimeout(
      timeout
    );

    if (!response.ok) {
      return {
        verified: false,

        reason:
          'Fonte respondeu HTTP ' +
          response.status,

        evidenceText: ''
      };
    }

    const contentType =
      String(
        response.headers.get(
          'content-type'
        ) || ''
      ).toLowerCase();

    if (
      !contentType.includes(
        'text/html'
      ) &&
      !contentType.includes(
        'text/plain'
      ) &&
      !contentType.includes(
        'application/xhtml+xml'
      )
    ) {
      return {
        verified: false,
        reason:
          'Fonte nao textual',
        evidenceText: ''
      };
    }

    const html =
      (
        await response.text()
      ).substring(
        0,
        750000
      );

    const pagina =
      limparHtml(
        html
      ).substring(
        0,
        120000
      );

    if (!pagina) {
      return {
        verified: false,

        reason:
          'Conteudo publico nao recuperavel',

        evidenceText: ''
      };
    }

    const relevancia =
      relevanciaQuery(
        pagina,
        query
      );

    const intentInfo =
      calcularBuyerIntent(
        pagina,
        query
      );

    // URL existente, sozinha, nao basta.
    // O conteudo recuperado precisa confirmar
    // assunto + algum sinal de pesquisa/compra.

    if (
      relevancia === 0 ||
      intentInfo.score < 25
    ) {
      return {
        verified: false,

        reason:
          'Pagina nao confirmou relevancia/intencao',

        evidenceText: ''
      };
    }

    const descoberta =
      textoSeguro(
        textoDescoberto,
        800
      );

    const evidencia =
      descoberta &&
      normalizar(
        pagina
      ).indexOf(
        normalizar(
          descoberta
        )
      ) !== -1
        ? descoberta
        : textoSeguro(
            pagina,
            1200
          );

    return {
      verified: true,

      reason:
        'Evidencia confirmada na fonte publica',

      evidenceText:
        evidencia,

      finalUrl:
        response.url ||
        sourceUrl,

      intentInfo:
        intentInfo
    };

  } catch (e) {
    return {
      verified: false,

      reason:
        e &&
        e.name ===
          'AbortError'
          ? 'Timeout ao verificar fonte'
          : 'Nao foi possivel verificar a fonte',

      evidenceText: ''
    };
  }
}

// ============================================================
// FONTE 1 — FACEBOOK GROUPS VIA APIFY
//
// Somente roda quando existem grupos realmente configurados
// para o nicho.
//
// Ausencia de grupos NAO interrompe o Radar.
// Serper continua funcionando independentemente.
//
// Nunca usar grupos agro para outro nicho.
// ============================================================

async function buscarFacebookGroups(
  query,
  location,
  nacional
) {
  if (!APIFY_API_TOKEN) {
    console.warn(
      'Apify: token nao configurado'
    );

    return [];
  }

  const nicho =
    detectarNicho(
      query
    );

  const grupos =
    GRUPOS_POR_NICHO[
      nicho
    ] || [];

  if (!grupos.length) {
    console.log(
      '>>> Facebook ignorado: nenhum grupo configurado para nicho "' +
      nicho +
      '"'
    );

    return [];
  }

  try {
    console.log(
      '>>> Facebook Buyer Intent: "' +
      query +
      '" | nicho=' +
      nicho +
      ' | grupos=' +
      grupos.length
    );

    const url =
      'https://api.apify.com/v2/acts/' +
      ACTOR_ID +
      '/run-sync-get-dataset-items?token=' +
      APIFY_API_TOKEN;

    const startUrls =
      grupos.map(
        function(g) {
          return {
            url: g
          };
        }
      );

    const response =
      await fetch(
        url,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              startUrls:
                startUrls,

              maxPosts:
                40,

              maxComments:
                0,

              onlyPostsNewerThan:
                '1 month',

              viewOption:
                'CHRONOLOGICAL'
            })
        }
      );

    if (!response.ok) {
      const errText =
        await response.text();

      console.error(
        '>>> Apify HTTP:',
        response.status,
        errText.slice(
          0,
          500
        )
      );

      return [];
    }

    const data =
      await response.json();

    const posts =
      Array.isArray(data)
        ? data
        : [];

    console.log(
      '>>> Apify retornou ' +
      posts.length +
      ' posts brutos'
    );

    const resultados = [];

    for (
      const post
      of posts
    ) {
      const textoPost =
        post.text ||
        post.message ||
        post.postText ||
        '';

      const textoNorm =
        normalizar(
          textoPost
        );

      if (
        textoNorm.length <
        20
      ) {
        continue;
      }

      if (
        contemAlgum(
          textoNorm,
          PALAVRAS_SPAM
        )
      ) {
        continue;
      }

      // O post precisa estar relacionado
      // ao produto/nicho pesquisado.

      if (
        relevanciaQuery(
          textoPost,
          query
        ) === 0
      ) {
        continue;
      }

      const intentInfo =
        calcularBuyerIntent(
          textoPost,
          query
        );

      // Evita transformar qualquer mencao
      // ao produto em comprador.

      if (
        intentInfo.score <
        35
      ) {
        continue;
      }

      const nomeAutor =
        (
          post.user &&
          post.user.name
        ) ||
        (
          post.author &&
          post.author.name
        ) ||
        post.authorName ||
        post.userName ||
        'Autor do post';

      const urlPost =
        post.url ||
        post.postUrl ||
        post.facebookUrl ||
        post.link ||
        '';

      if (
        !urlPost ||
        urlPost.indexOf(
          'http'
        ) !== 0
      ) {
        continue;
      }

      const nomeGrupo =
        nomeDoGrupo(
          urlPost
        );

      resultados.push(
        montarLead({
          name:
            nomeAutor,

          phone:
            extrairTelefone(
              textoPost
            ) || '',

          email: '',

          instagram: '',

          location:
            location,

          profileUrl:
            urlPost,

          platform:
            'facebook',

          source:
            'Facebook Groups',

          sourceUrl:
            urlPost,

          text:
            textoPost,

          date:
            post.time ||
            post.timestamp,

          query:
            query,

          nicho:
            nicho,

          intent:
            intentInfo,

          company:
            nomeGrupo,

          group:
            nomeGrupo,

          verifiedEvidence:
            true,

          verificationReason:
            'Evidencia recuperada diretamente da fonte publica via scraper'
        })
      );
    }

    resultados.sort(
      function(a, b) {
        return (
          (b.score || 0) -
          (a.score || 0)
        );
      }
    );

    console.log(
      '>>> Facebook: ' +
      resultados.length +
      ' oportunidades relevantes'
    );

    return resultados;

  } catch (err) {
    console.error(
      '>>> Erro Apify:',
      err.message
    );

    return [];
  }
}

// ============================================================
// FONTE 2 — SERPER / GOOGLE
//
// Serper agora funciona como DESCOBERTA.
// Um resultado do Google NAO vira lead automaticamente.
//
// Antes de entrar no Radar:
// 1. URL precisa ser publica;
// 2. pagina precisa ser recuperada;
// 3. conteudo precisa confirmar relevancia;
// 4. conteudo precisa apresentar sinal de intencao.
// ============================================================

async function buscarSerper(
  query,
  location,
  nacional
) {
  if (!SERPER_API_KEY) {
    console.warn(
      'Serper: chave nao configurada'
    );

    return [];
  }

  try {
    const termo =
      textoSeguro(
        query,
        200
      );

    if (!termo) {
      return [];
    }

    const local =
      !nacional &&
      location
        ? ' "' +
          textoSeguro(
            location,
            120
          ) +
          '"'
        : '';

    const q =
      '"' +
      termo +
      '" ' +
      '(' +
      '"quero comprar" OR ' +
      '"preciso comprar" OR ' +
      '"onde comprar" OR ' +
      '"onde encontro" OR ' +
      '"estou procurando" OR ' +
      '"alguem indica" OR ' +
      '"qual comprar" OR ' +
      '"recomendacao" OR ' +
      '"vale a pena" OR ' +
      '"pensando em comprar"' +
      ')' +
      local;

    console.log(
      '>>> Serper discovery query:',
      q
    );

    const response =
      await fetch(
        'https://google.serper.dev/search',
        {
          method: 'POST',

          headers: {
            'X-API-KEY':
              SERPER_API_KEY,

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              q: q,
              gl: 'br',
              hl: 'pt-br',
              num: 20
            })
        }
      );

    if (!response.ok) {
      console.error(
        '>>> Serper HTTP:',
        response.status
      );

      return [];
    }

    const data =
      await response.json();

    const organic =
      Array.isArray(
        data.organic
      )
        ? data.organic
        : [];

    console.log(
      '>>> Serper retornou ' +
      organic.length +
      ' candidatos'
    );

    const nicho =
      detectarNicho(
        query
      );

    const candidatos =
      organic
        .map(
          function(item) {
            return {
              title:
                textoSeguro(
                  item.title,
                  250
                ),

              snippet:
                textoSeguro(
                  item.snippet,
                  1000
                ),

              link:
                textoSeguro(
                  item.link,
                  1000
                ),

              displayLink:
                textoSeguro(
                  item.displayLink,
                  160
                )
            };
          }
        )

        .filter(
          function(item) {
            if (
              !urlPublicaSegura(
                item.link
              )
            ) {
              return false;
            }

            const descoberta =
              item.title +
              ' ' +
              item.snippet;

            if (
              contemAlgum(
                descoberta,
                PALAVRAS_SPAM
              )
            ) {
              return false;
            }

            return (
              relevanciaQuery(
                descoberta,
                query
              ) > 0
            );
          }
        )

        .slice(
          0,
          12
        );

    const verificados =
      await Promise.all(
        candidatos.map(
          async function(item) {
            const descoberta =
              (
                item.title +
                ' ' +
                item.snippet
              ).trim();

            const prova =
              await verificarEvidenciaPublica(
                item.link,
                query,
                descoberta
              );

            if (
              !prova.verified
            ) {
              return null;
            }

            const evidencia =
              prova.evidenceText ||
              descoberta;

            const intentInfo =
              prova.intentInfo ||
              calcularBuyerIntent(
                evidencia,
                query
              );

            return montarLead({
              name:
                item.title ||
                'Oportunidade encontrada',

              phone:
                extrairTelefone(
                  evidencia
                ) || '',

              email: '',

              instagram: '',

              location:
                location,

              profileUrl:
                prova.finalUrl ||
                item.link,

              platform:
                'google_search',

              source:
                'Google Search',

              sourceUrl:
                prova.finalUrl ||
                item.link,

              text:
                evidencia,

              // Serper nao fornece uma data
              // confiavel neste fluxo.
              date: '',

              query:
                query,

              nicho:
                nicho,

              intent:
                intentInfo,

              company:
                item.displayLink ||
                'Google Search',

              group:
                'Google',

              verifiedEvidence:
                true,

              verificationReason:
                prova.reason
            });
          }
        )
      );

    const finais =
      verificados.filter(
        Boolean
      );

    console.log(
      '>>> Serper: ' +
      finais.length +
      ' oportunidades com evidencia verificada'
    );

    return finais;

  } catch (err) {
    console.error(
      '>>> Erro Serper:',
      err.message
    );

    return [];
  }
}

// ============================================================
// FONTE 3 — GEMINI COMO CLASSIFICADOR
//
// REGRA FUNDAMENTAL DA v19:
//
// Gemini NAO:
// - procura pessoas
// - cria leads
// - cria nomes
// - cria URLs
// - cria telefones
// - cria emails
// - cria Instagram
// - cria comentarios
//
// Gemini recebe somente oportunidades que ja foram
// encontradas em fontes publicas e classificadas como
// evidencia verificavel.
//
// Sua unica funcao e auxiliar na classificacao da
// intensidade da intencao de compra.
// ============================================================

async function classificarComGemini(
  leads,
  query
) {
  if (
    !GEMINI_API_KEY ||
    !Array.isArray(leads) ||
    !leads.length
  ) {
    return leads || [];
  }

  try {
    const amostra =
      leads
        .slice(0, 20)
        .map(
          function(
            lead,
            index
          ) {
            return {
              id: index,

              evidenceText:
                textoSeguro(
                  lead.intent,
                  900
                ),

              sourceUrl:
                textoSeguro(
                  lead.sourceUrl,
                  1000
                ),

              localScore:
                lead.buyerIntentScore ||
                lead.score ||
                0
            };
          }
        );

    const prompt = `
Voce e apenas um CLASSIFICADOR de evidencias ja recuperadas e verificadas pelo Radar de Compradores.

CONSULTA:
"${textoSeguro(query, 300)}"

REGRAS OBRIGATORIAS:

1. NAO descubra novas pessoas.
2. NAO descubra novas URLs.
3. NAO crie telefones.
4. NAO crie emails.
5. NAO crie perfis de redes sociais.
6. NAO crie nomes.
7. NAO complete dados ausentes.
8. NAO altere sourceUrl.
9. NAO transforme suposicao em fato.
10. Analise SOMENTE evidenceText recebido.
11. Retorne SOMENTE JSON valido.
12. Para cada id, informe apenas:
    - buyerIntentScore de 0 a 100
    - buyerIntentLevel
13. buyerIntentLevel deve ser:
    - "alta"
    - "media"
    - "baixa"

CRITERIOS:

ALTA:
a pessoa demonstra claramente que pretende comprar,
esta procurando onde comprar, pede link, preco,
indicacao de produto, disponibilidade ou demonstra
necessidade imediata.

MEDIA:
a pessoa esta comparando, pesquisando,
pedindo opiniao, avaliando custo-beneficio
ou considerando uma compra.

BAIXA:
ha interesse no assunto/produto, mas nao existe
evidencia suficiente de decisao ou pesquisa ativa
de compra.

ENTRADAS:

${JSON.stringify(amostra)}

FORMATO EXATO:

[
  {
    "id": 0,
    "buyerIntentScore": 0,
    "buyerIntentLevel": "baixa"
  }
]
`.trim();

    const response =
      await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
          GEMINI_API_KEY,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        prompt
                    }
                  ]
                }
              ],

              generationConfig: {
                temperature: 0,
                maxOutputTokens:
                  2048
              }
            })
        }
      );

    if (!response.ok) {
      console.error(
        '>>> Gemini classifier HTTP:',
        response.status
      );

      // Se Gemini falhar, os leads verificados
      // continuam existindo com o score local.
      return leads;
    }

    const data =
      await response.json();

    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(
        data.candidates[0]
          .content.parts
      )
        ? data.candidates[0]
            .content.parts
        : [];

    const text =
      parts
        .map(
          function(part) {
            return (
              part &&
              part.text
                ? part.text
                : ''
            );
          }
        )
        .join('\n')
        .trim();

    const match =
      text.match(
        /\[[\s\S]*\]/
      );

    if (!match) {
      console.warn(
        '>>> Gemini classifier: resposta sem JSON utilizavel'
      );

      return leads;
    }

    let classificacoes;

    try {
      classificacoes =
        JSON.parse(
          match[0]
        );

    } catch (e) {
      console.error(
        '>>> Gemini classifier JSON invalido:',
        e.message
      );

      return leads;
    }

    if (
      !Array.isArray(
        classificacoes
      )
    ) {
      return leads;
    }

    const porId =
      new Map();

    classificacoes.forEach(
      function(c) {
        if (
          c &&
          Number.isInteger(
            Number(c.id)
          ) &&
          Number.isFinite(
            Number(
              c.buyerIntentScore
            )
          )
        ) {
          porId.set(
            Number(c.id),
            c
          );
        }
      }
    );

    const classificados =
      leads.map(
        function(
          lead,
          index
        ) {
          const c =
            porId.get(
              index
            );

          if (!c) {
            return lead;
          }

          const localScore =
            lead.buyerIntentScore ||
            lead.score ||
            0;

          const modelScore =
            limitarNumero(
              Number(
                c.buyerIntentScore
              ),
              0,
              100
            );

          // O score deterministico local tem maior peso.
          // Gemini apenas refina a priorizacao.
          //
          // Isso impede que o modelo transforme sozinho
          // uma evidencia fraca em lead prioritario.

          const scoreFinal =
            Math.round(
              (
                localScore *
                0.7
              ) +
              (
                modelScore *
                0.3
              )
            );

          const nivel =
            scoreFinal >= 75
              ? 'alta'
              : scoreFinal >= 50
                ? 'media'
                : 'baixa';

          return {
            ...lead,

            buyerIntentScore:
              scoreFinal,

            buyerIntentLevel:
              nivel,

            score:
              scoreFinal,

            confidence:
              scoreFinal,

            aiClassificationOnly:
              true
          };
        }
      );

    console.log(
      '>>> Gemini classificou ' +
      classificados.length +
      ' oportunidades previamente verificadas'
    );

    return classificados;

  } catch (err) {
    console.error(
      '>>> Erro Gemini classifier:',
      err.message
    );

    return leads;
  }
}

// ============================================================
// DEDUPLICACAO
// ============================================================

function chaveLead(item) {
  const sourceUrl =
    normalizar(
      item.sourceUrl ||
      item.profileUrl ||
      ''
    );

  if (sourceUrl) {
    return (
      'url:' +
      sourceUrl
    );
  }

  const nome =
    normalizar(
      item.name ||
      ''
    );

  const texto =
    normalizar(
      item.intent ||
      item.evidenceText ||
      ''
    ).substring(
      0,
      160
    );

  return (
    'txt:' +
    nome +
    ':' +
    texto
  );
}

function deduplicar(lista) {
  const mapa =
    new Map();

  for (
    const item
    of lista
  ) {
    if (!item) {
      continue;
    }

    const chave =
      chaveLead(
        item
      );

    if (
      !mapa.has(
        chave
      )
    ) {
      mapa.set(
        chave,
        item
      );

      continue;
    }

    const existente =
      mapa.get(
        chave
      );

    // Em duplicatas, conserva a versao
    // de maior score.

    if (
      (
        item.score ||
        0
      ) >
      (
        existente.score ||
        0
      )
    ) {
      mapa.set(
        chave,
        item
      );
    }
  }

  return Array.from(
    mapa.values()
  );
}

// ============================================================
// RESUMO DO RADAR
// ============================================================

function gerarResumoRadar(
  leads
) {
  const lista =
    Array.isArray(leads)
      ? leads
      : [];

  const alta =
    lista.filter(
      function(item) {
        return (
          item.buyerIntentLevel ===
          'alta'
        );
      }
    ).length;

  const media =
    lista.filter(
      function(item) {
        return (
          item.buyerIntentLevel ===
          'media'
        );
      }
    ).length;

  const baixa =
    lista.filter(
      function(item) {
        return (
          item.buyerIntentLevel ===
          'baixa'
        );
      }
    ).length;

  // Por enquanto consideramos recomendadas
  // para abordagem apenas alta e media intencao.
  //
  // O casamento com produtos Shopee sera
  // implementado em etapa separada e real.
  // Nao inventamos correspondencias.

  const recomendadas =
    alta +
    media;

  return {
    oportunidades_encontradas:
      lista.length,

    intencao_alta:
      alta,

    intencao_media:
      media,

    intencao_baixa:
      baixa,

    produtos_correspondentes:
      0,

    recomendadas_para_abordagem:
      recomendadas
  };
}

// ============================================================
// ORDENACAO FINAL
// ============================================================

function ordenarResultados(
  lista
) {
  return (
    Array.isArray(lista)
      ? lista
      : []
  ).sort(
    function(a, b) {
      const scoreA =
        Number(
          a.buyerIntentScore ||
          a.score ||
          0
        );

      const scoreB =
        Number(
          b.buyerIntentScore ||
          b.score ||
          0
        );

      if (
        scoreB !==
        scoreA
      ) {
        return (
          scoreB -
          scoreA
        );
      }

      const telA =
        a.phone
          ? 1
          : 0;

      const telB =
        b.phone
          ? 1
          : 0;

      return (
        telB -
        telA
      );
    }
  );
}

// ============================================================
// HANDLER PRINCIPAL — B2C BUYER INTENT v19 VERIFIED
// ============================================================

export default async function handler(
  req,
  res
) {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (
    req.method ===
    'OPTIONS'
  ) {
    return res
      .status(200)
      .end();
  }

  if (
    req.method !==
    'POST'
  ) {
    return res
      .status(405)
      .json({
        error:
          'Metodo nao permitido. Use POST.'
      });
  }

  try {
    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    const body =
      await lerBodyRaw(
        req
      );

    const query =
      textoSeguro(
        body.query ||
        body.searchTerm ||
        body.term ||
        '',
        300
      );

    const city =
      textoSeguro(
        body.city ||
        '',
        100
      );

    const state =
      textoSeguro(
        body.state ||
        '',
        30
      );

    let location =
      textoSeguro(
        body.location ||
        '',
        150
      );

    if (
      !location &&
      (
        city ||
        state
      )
    ) {
      location =
        [
          city,
          state
        ]
          .filter(Boolean)
          .join(',');
    }

    const requestedLimit =
      Number(
        body.limit ||
        body.quantity ||
        body.maxResults ||
        20
      );

    const limit =
      limitarNumero(
        requestedLimit,
        1,
        100
      );

    // --------------------------------------------------------
    // VALIDACAO
    // --------------------------------------------------------

    if (!query) {
      return res
        .status(400)
        .json({
          error:
            'Informe o que deseja buscar.'
        });
    }

    const nicho =
      detectarNicho(
        query
      );

    console.log(
      '===== B2C BUYER INTENT v19 VERIFIED ====='
    );

    console.log(
      '>>> Consulta:',
      query
    );

    console.log(
      '>>> Nicho:',
      nicho
    );

    console.log(
      '>>> Local:',
      location ||
      'Brasil'
    );

    // --------------------------------------------------------
    // DESCOBERTA
    //
    // Facebook e Serper funcionam independentemente.
    //
    // Nao existir grupo Facebook para determinado nicho
    // NAO encerra a pesquisa.
    // --------------------------------------------------------

    const resultados =
      await Promise.all([
        buscarFacebookGroups(
          query,
          location,
          !location
        ),

        buscarSerper(
          query,
          location,
          !location
        )
      ]);

    const facebook =
      Array.isArray(
        resultados[0]
      )
        ? resultados[0]
        : [];

    const serper =
      Array.isArray(
        resultados[1]
      )
        ? resultados[1]
        : [];

    const descobertos =
      []
        .concat(
          facebook,
          serper
        );

    console.log(
      '>>> Descobertos antes da classificacao:',
      descobertos.length
    );

    // --------------------------------------------------------
    // GEMINI SOMENTE CLASSIFICA
    //
    // O modelo NAO pesquisa pessoas e NAO cria leads.
    // --------------------------------------------------------

    const classificados =
      await classificarComGemini(
        descobertos,
        query
      );

    // --------------------------------------------------------
    // TRAVA DE EVIDENCIA
    //
    // Nenhum resultado entra no Radar se:
    //
    // - nao possuir verifiedEvidence === true
    // - nao possuir sourceUrl publica valida
    //
    // Isso impede que inferencias ou resultados sem fonte
    // sejam tratados como compradores reais.
    // --------------------------------------------------------

    const somenteVerificados =
      (
        Array.isArray(
          classificados
        )
          ? classificados
          : []
      ).filter(
        function(item) {
          return (
            item &&
            item.verifiedEvidence ===
              true &&
            urlPublicaSegura(
              item.sourceUrl
            )
          );
        }
      );

    // --------------------------------------------------------
    // DEDUPLICACAO
    // --------------------------------------------------------

    const unicos =
      deduplicar(
        somenteVerificados
      );

    // --------------------------------------------------------
    // ORDENACAO
    // --------------------------------------------------------

    const ordenados =
      ordenarResultados(
        unicos
      );

    // --------------------------------------------------------
    // LIMITE SOLICITADO
    // --------------------------------------------------------

    const resultadosFinais =
      ordenados.slice(
        0,
        limit
      );

    // --------------------------------------------------------
    // RADAR
    // --------------------------------------------------------

    const radar =
      gerarResumoRadar(
        resultadosFinais
      );

    const quantidadeComTelefone =
      resultadosFinais.filter(
        function(item) {
          return !!item.phone;
        }
      ).length;

    console.log(
      '>>> Finalizado: ' +
      resultadosFinais.length +
      ' oportunidades verificadas (' +
      quantidadeComTelefone +
      ' com telefone publico)'
    );

    console.log(
      '>>> Radar:',
      JSON.stringify(
        radar
      )
    );

    // --------------------------------------------------------
    // RESPOSTA
    // --------------------------------------------------------

    return res
      .status(200)
      .json({
        leads:
          resultadosFinais,

        meta: {
          engine:
            'B2C Buyer Intent v19 VERIFIED',

          query:
            query,

          niche:
            nicho,

          category:
            categoriaLegivel(
              nicho
            ),

          location:
            location ||
            'Brasil',

          total:
            resultadosFinais.length,

          requestedLimit:
            limit,

          verifiedOnly:
            true,

          summary:
            resultadosFinais.length +
            ' oportunidades verificadas encontradas; ' +
            radar.intencao_alta +
            ' com intencao alta; ' +
            radar.intencao_media +
            ' com intencao media; ' +
            radar.recomendadas_para_abordagem +
            ' recomendadas para avaliacao de abordagem.',

          radar:
            radar,

          sources: {
            facebook:
              resultadosFinais.filter(
                function(r) {
                  return (
                    r.platform ===
                    'facebook'
                  );
                }
              ).length,

            serper:
              resultadosFinais.filter(
                function(r) {
                  return (
                    r.platform ===
                    'google_search'
                  );
                }
              ).length,

            gemini_classificados:
              resultadosFinais.filter(
                function(r) {
                  return (
                    r.aiClassificationOnly ===
                    true
                  );
                }
              ).length
          },

          integrity: {
            dados_inventados:
              false,

            telefone_inventado:
              false,

            instagram_inventado:
              false,

            email_inventado:
              false,

            rating_sintetico:
              false,

            reviews_sinteticos:
              false,

            data_sintetica:
              false,

            evidencia_obrigatoria:
              true,

            gemini_cria_leads:
              false
          }
        }
      });

  } catch (err) {
    console.error(
      '>>> ERRO B2C v19:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Erro interno no Radar de Compradores.',

        details:
          process.env.NODE_ENV ===
          'development'
            ? err.message
            : undefined
      });
  }
}

