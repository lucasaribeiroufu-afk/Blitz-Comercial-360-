// ============================================================
// BLITZ 360 — B2C BUYER INTENT ENGINE v18
// Radar de Compradores Multi-nicho
//
// Objetivo:
// - respeitar exatamente a consulta do usuario
// - localizar manifestacoes PUBLICAS de intencao de compra
// - funcionar em multiplos nichos
// - classificar oportunidades por Buyer Intent Score
// - NAO inventar telefone, Instagram, avaliacao ou reviews
// - manter compatibilidade com o frontend atual
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ACTOR_ID = 'apify~facebook-groups-scraper';

// ============================================================
// FACEBOOK — grupos existentes e efetivamente configurados
//
// IMPORTANTE:
// Neste momento somente "agro" possui grupos conhecidos no
// projeto original. Outros nichos NAO devem cair no agro.
// Serper + Gemini assumem a busca multi-nicho.
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
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function textoSeguro(valor, limite) {
  const texto = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!limite) return texto;
  return texto.substring(0, limite);
}

function extrairTelefone(texto) {
  if (!texto) return null;

  const regex = /(?:\(?([1-9]{2})\)?\s*)?(9?\d{4})[-\s]?(\d{4})/g;
  const matches = String(texto).match(regex);

  if (!matches) return null;

  for (const m of matches) {
    const digits = m.replace(/\D/g, '');

    if (digits.length >= 10 && digits.length <= 11) {
      const ddd = digits.slice(0, 2);
      const dddNumero = parseInt(ddd, 10);

      if (dddNumero >= 11 && dddNumero <= 99) {
        const numero = digits.slice(2);

        if (numero.length === 9) {
          return '(' + ddd + ') ' +
            numero.slice(0, 5) + '-' +
            numero.slice(5);
        }

        if (numero.length === 8) {
          return '(' + ddd + ') ' +
            numero.slice(0, 4) + '-' +
            numero.slice(4);
        }
      }
    }
  }

  return null;
}

function detectarNicho(query) {
  const q = normalizar(query);

  const mapas = [
    {
      nicho: 'casa',
      termos: [
        'casa', 'achadinho', 'decoracao', 'cozinha', 'banheiro',
        'quarto', 'sala', 'organizador', 'utensilio', 'panela',
        'lava louca', 'lava loucas', 'air fryer', 'aspirador',
        'robo aspirador', 'cafeteira', 'liquidificador',
        'micro ondas', 'geladeira', 'fogao', 'eletrodomestico'
      ]
    },
    {
      nicho: 'beleza',
      termos: [
        'beleza', 'maquiagem', 'perfume', 'cosmetico', 'skincare',
        'cabelo', 'secador', 'chapinha', 'escova secadora',
        'hidratante', 'protetor solar'
      ]
    },
    {
      nicho: 'moda',
      termos: [
        'moda', 'roupa', 'vestido', 'blusa', 'calca', 'tenis',
        'sapato', 'bolsa', 'feminino', 'masculino'
      ]
    },
    {
      nicho: 'eletronicos',
      termos: [
        'eletronico', 'celular', 'iphone', 'smartphone',
        'notebook', 'tablet', 'televisao', 'tv', 'fone',
        'smartwatch', 'monitor', 'computador'
      ]
    },
    {
      nicho: 'automotivo',
      termos: [
        'carro', 'moto', 'automotivo', 'pneu', 'capacete',
        'acessorio carro', 'acessorio moto'
      ]
    },
    {
      nicho: 'agro',
      termos: [
        'gado', 'bovino', 'pecuaria', 'fazenda', 'boi', 'vaca',
        'leite', 'racao', 'suplemento animal', 'balanca bovina',
        'bezerro', 'novilha', 'touro'
      ]
    },
    {
      nicho: 'agricola',
      termos: [
        'fertilizante', 'adubo', 'defensivo', 'agricola',
        'plantio', 'safra', 'soja', 'milho', 'herbicida',
        'fungicida'
      ]
    },
    {
      nicho: 'pet',
      termos: [
        'pet', 'cachorro', 'gato', 'cao', 'areia para gato',
        'racao pet', 'brinquedo pet'
      ]
    },
    {
      nicho: 'infantil',
      termos: [
        'bebe', 'infantil', 'crianca', 'brinquedo',
        'carrinho de bebe', 'berco'
      ]
    }
  ];

  for (const mapa of mapas) {
    if (mapa.termos.some(function(termo) {
      return q.indexOf(normalizar(termo)) !== -1;
    })) {
      return mapa.nicho;
    }
  }

  // Não existe mais fallback para agro.
  return 'geral';
}

function categoriaLegivel(nicho) {
  const mapa = {
    casa: 'Casa e Eletrodomesticos',
    beleza: 'Beleza e Cuidados Pessoais',
    moda: 'Moda',
    eletronicos: 'Eletronicos',
    automotivo: 'Automotivo',
    agro: 'Agro e Pecuaria',
    agricola: 'Agricultura',
    pet: 'Pet',
    infantil: 'Infantil',
    geral: 'Outros'
  };

  return mapa[nicho] || 'Outros';
}

function contemAlgum(texto, lista) {
  const t = normalizar(texto);

  return lista.some(function(item) {
    return t.indexOf(normalizar(item)) !== -1;
  });
}

function relevanciaQuery(texto, query) {
  const t = normalizar(texto);
  const q = normalizar(query);

  if (!q) return 0;
  if (t.indexOf(q) !== -1) return 30;

  const palavras = q
    .split(' ')
    .filter(function(p) {
      return p.length >= 3;
    });

  if (!palavras.length) return 0;

  const encontradas = palavras.filter(function(p) {
    return t.indexOf(p) !== -1;
  }).length;

  const proporcao = encontradas / palavras.length;

  if (proporcao >= 0.8) return 25;
  if (proporcao >= 0.5) return 18;
  if (proporcao > 0) return 8;

  return 0;
}

function calcularBuyerIntent(texto, query) {
  const t = normalizar(texto);

  let score = 0;
  const sinais = [];

  const relevancia = relevanciaQuery(texto, query);
  score += relevancia;

  if (contemAlgum(t, SINAIS_ALTA_INTENCAO)) {
    score += 45;
    sinais.push('Intencao explicita de compra');
  } else if (contemAlgum(t, SINAIS_MEDIA_INTENCAO)) {
    score += 30;
    sinais.push('Pesquisa ativa / consideracao');
  } else if (contemAlgum(t, SINAIS_BAIXA_INTENCAO)) {
    score += 12;
    sinais.push('Interesse inicial');
  }

  if (
    /\b(r\$|reais|ate\s+r\$|orcamento|preco|valor|quanto custa)\b/i.test(
      String(texto || '')
    )
  ) {
    score += 12;
    sinais.push('Sinal de preco/orcamento');
  }

  if (
    /\b(hoje|agora|essa semana|urgente|logo|este mes)\b/i.test(
      normalizar(texto)
    )
  ) {
    score += 8;
    sinais.push('Sinal de urgencia');
  }

  if (
    /\b(link|shopee|mercado livre|amazon|loja|site)\b/i.test(
      normalizar(texto)
    )
  ) {
    score += 5;
    sinais.push('Busca por canal de compra');
  }

  // Resultado claramente comercial/oferta não deve ser confundido
  // automaticamente com comprador.
  if (
    contemAlgum(t, TERMOS_VENDA) &&
    !contemAlgum(t, SINAIS_ALTA_INTENCAO) &&
    !contemAlgum(t, SINAIS_MEDIA_INTENCAO)
  ) {
    score -= 20;
    sinais.push('Possivel vendedor/oferta');
  }

  score = limitarNumero(score, 0, 100);

  let nivel = 'baixa';

  if (score >= 75) nivel = 'alta';
  else if (score >= 50) nivel = 'media';

  return {
    score: score,
    nivel: nivel,
    sinais: sinais
  };
}

function classificarLocalizacao(texto, location) {
  if (!location) {
    return {
      score: 5,
      tipo_local: 'nacional',
      label_local: '🌎 Nacional',
      location: 'Brasil'
    };
  }

  const textoNorm = normalizar(texto);
  const partes = String(location).split(',');

  const cidadeAlvo = normalizar(partes[0] || '');
  const estadoAlvo = normalizar(partes[1] || '');

  if (
    cidadeAlvo &&
    textoNorm.indexOf(cidadeAlvo) !== -1
  ) {
    return {
      score: 15,
      tipo_local: 'cidade',
      label_local: '📍 ' + location,
      location: location
    };
  }

  if (
    estadoAlvo &&
    estadoAlvo.length >= 2 &&
    (
      textoNorm.indexOf(' ' + estadoAlvo + ' ') !== -1 ||
      textoNorm.endsWith(' ' + estadoAlvo)
    )
  ) {
    return {
      score: 10,
      tipo_local: 'estado',
      label_local: '🏛️ ' + estadoAlvo.toUpperCase(),
      location: 'Estado: ' + estadoAlvo.toUpperCase()
    };
  }

  const minhaRegiao = REGIAO_POR_ESTADO[estadoAlvo] || '';

  if (minhaRegiao) {
    const estadosRegiao = Object.keys(REGIAO_POR_ESTADO).filter(
      function(e) {
        return REGIAO_POR_ESTADO[e] === minhaRegiao;
      }
    );

    for (const est of estadosRegiao) {
      if (textoNorm.indexOf(' ' + est + ' ') !== -1) {
        return {
          score: 7,
          tipo_local: 'regiao',
          label_local: '🗺️ Regiao ' + minhaRegiao,
          location: 'Regiao ' + minhaRegiao
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

function nomeDoGrupo(url) {
  if (!url) return 'Grupo Facebook';

  for (const id in NOMES_GRUPOS) {
    if (url.indexOf(id) !== -1) {
      return NOMES_GRUPOS[id];
    }
  }

  return 'Grupo Facebook';
}

function dataISO(valor) {
  if (!valor) {
    return new Date().toISOString().split('T')[0];
  }

  try {
    let d;

    if (
      typeof valor === 'number' &&
      valor < 1000000000000
    ) {
      d = new Date(valor * 1000);
    } else {
      d = new Date(valor);
    }

    if (Number.isNaN(d.getTime())) {
      return new Date().toISOString().split('T')[0];
    }

    return d.toISOString().split('T')[0];
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

async function lerBodyRaw(req) {
  if (
    req.body &&
    typeof req.body === 'object' &&
    Object.keys(req.body).length > 0
  ) {
    return req.body;
  }

  if (req.body && typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {}
  }

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(
        typeof chunk === 'string'
          ? Buffer.from(chunk)
          : chunk
      );
    }

    const rawBody = Buffer.concat(chunks).toString('utf8');

    if (rawBody) {
      return JSON.parse(rawBody);
    }
  } catch (e) {}

  return {};
}

// ============================================================
// MODELO DE LEAD COMPATIVEL COM O FRONTEND ATUAL
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
    group
  } = params;

  const telefone = phone || extrairTelefone(text) || '';
  const intentInfo = intent || calcularBuyerIntent(text, query);

  const geoInfo = geo || classificarLocalizacao(text, location);

  const scoreFinal = limitarNumero(
    intentInfo.score + (geoInfo.score || 0),
    0,
    100
  );

  const nivelFinal =
    scoreFinal >= 75
      ? 'alta'
      : scoreFinal >= 50
        ? 'media'
        : 'baixa';

  const trecho = textoSeguro(text, 500);

  return {
    name: textoSeguro(name, 160) || 'Oportunidade encontrada',

    // Somente dados encontrados na fonte.
    phone: telefone,
    email: email || '',
    instagram: instagram || '',

    location: geoInfo.location || location || 'Brasil',

    profileUrl: profileUrl || sourceUrl || '',
    platform: platform || 'website',

    // Mantido por compatibilidade com a interface atual.
    entityType: 'pf',

    company: company || source || 'Fonte publica',
    category: categoriaLegivel(nicho),

    decisionMaker:
      'Intencao de compra ' +
      nivelFinal.toUpperCase() +
      ' — ' +
      textoSeguro(trecho, 100),

    department:
      'Radar de Compradores | ' +
      categoriaLegivel(nicho),

    legalSource:
      'Origem: conteudo publico encontrado em ' +
      (source || 'fonte publica'),

    pitchRecommendation:
      nivelFinal === 'alta'
        ? 'Oportunidade de alta intencao. Avalie o contexto original e responda no canal publico em que a pessoa manifestou interesse.'
        : nivelFinal === 'media'
          ? 'Oportunidade em consideracao. Avalie o contexto antes de recomendar produto.'
          : 'Sinal fraco de compra. Prioridade baixa.',

    trendingInsights: [
      '📝 ' + textoSeguro(trecho, 180),
      '🎯 Intencao: ' + nivelFinal.toUpperCase(),
      '📊 Buyer Intent Score: ' + scoreFinal + '/100'
    ],

    competitorPrices: '',
    demandTimeframe: 'Recente',

    // Não inventar estrelas/reviews.
    rating: 0,
    reviewsCount: 0,

    confidence: scoreFinal,
    score: scoreFinal,

    // Mantido para compatibilidade.
    score_atuacao: intentInfo.score,

    buyerIntentScore: scoreFinal,
    buyerIntentLevel: nivelFinal,
    buyerIntentSignals: intentInfo.sinais || [],

    tem_telefone: !!telefone,

    tipo: 'buyer_intent',
    grupo: group || source || 'Fonte publica',

    label_local: geoInfo.label_local || '🌎 Nacional',
    tipo_local: geoInfo.tipo_local || 'nacional',

    date: dataISO(date),

    source: source || 'Fonte publica',
    sourceUrl: sourceUrl || profileUrl || '',

    intent: trecho,
    query: query,

    contact: telefone || null,

    observacao:
      'Radar de Compradores — dados exibidos somente quando encontrados na fonte publica'
  };
}

// ============================================================
// FONTE 1 — FACEBOOK GROUPS VIA APIFY
//
// Por segurança lógica, somente roda quando há grupos realmente
// configurados para o nicho. Nunca usa grupos agro para outro nicho.
// ============================================================

async function buscarFacebookGroups(query, location, nacional) {
  if (!APIFY_API_TOKEN) {
    console.warn('Apify: token nao configurado');
    return [];
  }

  const nicho = detectarNicho(query);
  const grupos = GRUPOS_POR_NICHO[nicho] || [];

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

    const startUrls = grupos.map(function(g) {
      return { url: g };
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startUrls: startUrls,
        maxPosts: 40,
        maxComments: 0,
        onlyPostsNewerThan: '1 month',
        viewOption: 'CHRONOLOGICAL'
      })
    });

    if (!response.ok) {
      const errText = await response.text();

      console.error(
        '>>> Apify HTTP:',
        response.status,
        errText.slice(0, 500)
      );

      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];

    console.log(
      '>>> Apify retornou ' +
      posts.length +
      ' posts brutos'
    );

    const resultados = [];

    for (const post of posts) {
      const textoPost =
        post.text ||
        post.message ||
        post.postText ||
        '';

      const textoNorm = normalizar(textoPost);

      if (textoNorm.length < 20) {
        continue;
      }

      if (contemAlgum(textoNorm, PALAVRAS_SPAM)) {
        continue;
      }

      // O post precisa ser relevante para a consulta.
      if (relevanciaQuery(textoPost, query) === 0) {
        continue;
      }

      const intentInfo =
        calcularBuyerIntent(textoPost, query);

      // Radar prioriza sinais reais de compra.
      if (intentInfo.score < 35) {
        continue;
      }

      const nomeAutor =
        (post.user && post.user.name) ||
        (post.author && post.author.name) ||
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
        urlPost.indexOf('http') !== 0
      ) {
        continue;
      }

      const nomeGrupo = nomeDoGrupo(urlPost);

      resultados.push(
        montarLead({
          name: nomeAutor,
          phone: extrairTelefone(textoPost) || '',
          email: '',
          instagram: '',
          location: location,
          profileUrl: urlPost,
          platform: 'facebook',
          source: 'Facebook Groups',
          sourceUrl: urlPost,
          text: textoPost,
          date: post.time || post.timestamp,
          query: query,
          nicho: nicho,
          intent: intentInfo,
          company: nomeGrupo,
          group: nomeGrupo
        })
      );
    }

    resultados.sort(function(a, b) {
      return (b.score || 0) - (a.score || 0);
    });

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
// ============================================================

async function buscarSerper(query, location, nacional) {
  if (!SERPER_API_KEY) {
    console.warn('Serper: chave nao configurada');
    return [];
  }

  try {
    const termo = textoSeguro(query, 200);

    if (!termo) {
      return [];
    }

    const local =
      !nacional && location
        ? ' "' + textoSeguro(location, 120) + '"'
        : '';

    // A consulta do usuario passa a ser o centro da pesquisa.
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
      '>>> Serper Buyer Intent query:',
      q
    );

    const response = await fetch(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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

    const data = await response.json();

    const organic =
      Array.isArray(data.organic)
        ? data.organic
        : [];

    console.log(
      '>>> Serper retornou ' +
      organic.length +
      ' resultados'
    );

    const nicho = detectarNicho(query);

    return organic
      .map(function(item) {
        const title = textoSeguro(item.title, 250);
        const snippet = textoSeguro(item.snippet, 1000);
        const link = textoSeguro(item.link, 1000);

        if (!link || link.indexOf('http') !== 0) {
          return null;
        }

        const texto =
          title + ' ' + snippet;

        if (contemAlgum(texto, PALAVRAS_SPAM)) {
          return null;
        }

        const intentInfo =
          calcularBuyerIntent(texto, query);

        if (intentInfo.score < 25) {
          return null;
        }

        return montarLead({
          name: title || 'Oportunidade encontrada',
          phone: extrairTelefone(snippet) || '',
          email: '',
          instagram: '',
          location: location,
          profileUrl: link,
          platform: 'google_search',
          source: 'Google Search',
          sourceUrl: link,
          text: snippet || title,
          date: null,
          query: query,
          nicho: nicho,
          intent: intentInfo,
          company:
            textoSeguro(item.displayLink, 160) ||
            'Google Search',
          group: 'Google'
        });
      })
      .filter(Boolean);

  } catch (err) {
    console.error(
      '>>> Erro Serper:',
      err.message
    );

    return [];
  }
}

// ============================================================
// FONTE 3 — GEMINI + GOOGLE SEARCH
//
// Gemini atua como descoberta/classificacao.
// O prompt proibe completar dados ausentes.
// ============================================================

async function buscarGemini(query, location, nacional) {
  if (!GEMINI_API_KEY) {
    console.warn('Gemini: chave nao configurada');
    return [];
  }

  try {
    const nicho = detectarNicho(query);

    const localTexto =
      !nacional && location
        ? 'Priorize resultados relacionados a ' + location + '.'
        : 'A busca pode abranger todo o Brasil.';

    const prompt = `
Voce e o mecanismo de descoberta do "Radar de Compradores" de uma plataforma comercial brasileira.

OBJETIVO:
Encontrar manifestacoes PUBLICAS e recentes de pessoas demonstrando intencao real ou potencial de comprar, pesquisar ou pedir recomendacao sobre:

"${textoSeguro(query, 300)}"

NICHO DETECTADO:
${categoriaLegivel(nicho)}

LOCALIZACAO:
${localTexto}

PROCURE sinais como:
- "quero comprar"
- "preciso comprar"
- "onde comprar"
- "onde encontro"
- "estou procurando"
- "alguem indica"
- "qual comprar"
- "qual recomendam"
- "vale a pena"
- "pensando em comprar"
- comparacao entre produtos
- pedido de recomendacao
- busca por preco, link ou custo-beneficio

REGRAS OBRIGATORIAS:
1. NAO procure empresas simplesmente relacionadas ao setor.
2. NAO retorne postos de combustivel, lojas, fornecedores ou empresas apenas porque pertencem ao mesmo mercado.
3. O resultado precisa ter relacao clara com a consulta "${textoSeguro(query, 300)}".
4. Priorize manifestacoes de consumidores/compradores.
5. Use somente informacoes publicamente visiveis nas fontes encontradas.
6. NAO invente nome, telefone, Instagram, email, localizacao, data, texto, avaliacao ou URL.
7. Se um dado nao estiver disponivel, use string vazia.
8. sourceUrl deve ser uma URL real encontrada pela pesquisa.
9. intent deve resumir ou reproduzir de forma curta o contexto que demonstra a intencao.
10. Se nao houver evidencia suficiente, NAO inclua o resultado.
11. Retorne somente JSON valido, sem Markdown e sem explicacoes.

FORMATO EXATO:
[
  {
    "name": "",
    "source": "",
    "sourceUrl": "",
    "intent": "",
    "location": "",
    "phone": "",
    "instagram": "",
    "email": "",
    "date": "",
    "buyerIntentScore": 0
  }
]

buyerIntentScore:
80-100 = intencao alta
50-79 = intencao media
0-49 = intencao baixa

Se nao encontrar resultados confiaveis:
[]
`.trim();

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
      GEMINI_API_KEY,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          tools: [
            {
              google_search: {}
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
          }
        })
      }
    );

    if (!response.ok) {
      console.error(
        '>>> Gemini HTTP:',
        response.status
      );

      return [];
    }

    const data = await response.json();

    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts
        : [];

    const text = parts
      .map(function(part) {
        return part && part.text
          ? part.text
          : '';
      })
      .join('\n')
      .trim();

    if (!text) {
      return [];
    }

    let jsonText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const arrayMatch =
      jsonText.match(/\[[\s\S]*\]/);

    if (!arrayMatch) {
      return [];
    }

    let resultados = [];

    try {
      resultados =
        JSON.parse(arrayMatch[0]);
    } catch (e) {
      console.error(
        '>>> Gemini JSON invalido:',
        e.message
      );

      return [];
    }

    if (!Array.isArray(resultados)) {
      return [];
    }

    return resultados
      .filter(function(r) {
        return (
          r &&
          r.sourceUrl &&
          String(r.sourceUrl).indexOf('http') === 0 &&
          r.intent
        );
      })
      .map(function(r) {
        const texto =
          textoSeguro(r.intent, 1000);

        // Recalcula localmente para não confiar cegamente
        // no score sugerido pelo modelo.
        const localIntent =
          calcularBuyerIntent(texto, query);

        const modelScore =
          limitarNumero(
            r.buyerIntentScore || 0,
            0,
            100
          );

        // Usa o maior sinal quando há evidência textual,
        // mas não permite que score do modelo sozinho
        // transforme resultado irrelevante em oportunidade.
        const relevancia =
          relevanciaQuery(texto, query);

        if (relevancia === 0) {
          return null;
        }

        const scoreCombinado =
          Math.max(
            localIntent.score,
            Math.min(modelScore, 90)
          );

        const intentInfo = {
          score: scoreCombinado,
          nivel:
            scoreCombinado >= 75
              ? 'alta'
              : scoreCombinado >= 50
                ? 'media'
                : 'baixa',
          sinais:
            localIntent.sinais || []
        };

        return montarLead({
          name:
            textoSeguro(r.name, 160) ||
            'Oportunidade encontrada',
          phone:
            textoSeguro(r.phone, 40) ||
            extrairTelefone(texto) ||
            '',
          email:
            textoSeguro(r.email, 200),
          instagram:
            textoSeguro(r.instagram, 200),
          location:
            textoSeguro(r.location, 160) ||
            location,
          profileUrl:
            textoSeguro(r.sourceUrl, 1000),
          platform: 'website',
          source:
            textoSeguro(r.source, 160) ||
            'Gemini + Google Search',
          sourceUrl:
            textoSeguro(r.sourceUrl, 1000),
          text: texto,
          date:
            textoSeguro(r.date, 30),
          query: query,
          nicho: nicho,
          intent: intentInfo,
          company:
            textoSeguro(r.source, 160) ||
            'Fonte publica',
          group: 'Gemini'
        });
      })
      .filter(Boolean);

  } catch (err) {
    console.error(
      '>>> Erro Gemini:',
      err.message
    );

    return [];
  }
}

// ============================================================
// DEDUPLICACAO
// ============================================================

function deduplicar(resultados) {
  const vistos = new Set();

  return resultados.filter(function(item) {
    if (!item) return false;

    const url =
      normalizar(item.sourceUrl || '');

    const texto =
      normalizar(
        (item.name || '') +
        ' ' +
        (item.intent || '')
      ).substring(0, 220);

    const chave =
      url || texto;

    if (!chave) return false;
    if (vistos.has(chave)) return false;

    vistos.add(chave);

    return true;
  });
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(req, res) {
  res.setHeader(
    'Access-Control-Allow-Credentials',
    true
  );

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Metodo nao permitido'
    });
  }

  const body = await lerBodyRaw(req);

  const query =
    textoSeguro(body.query, 300);

  const location =
    textoSeguro(body.location, 160);

  const count =
    limitarNumero(
      parseInt(body.count, 10) || 30,
      1,
      100
    );

  if (!query) {
    return res.status(400).json({
      error: 'Forneca o que deseja rastrear.'
    });
  }

  try {
    const nicho = detectarNicho(query);

    console.log(
      '===== B2C BUYER INTENT v18 ====='
    );

    console.log(
      'Query="' +
      query +
      '" | Local="' +
      (location || 'Brasil') +
      '" | Nicho="' +
      nicho +
      '"'
    );

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
        ),
        buscarGemini(
          query,
          location,
          !location
        )
      ]);

    const facebook =
      Array.isArray(resultados[0])
        ? resultados[0]
        : [];

    const serper =
      Array.isArray(resultados[1])
        ? resultados[1]
        : [];

    const gemini =
      Array.isArray(resultados[2])
        ? resultados[2]
        : [];

    const todos =
      [].concat(
        facebook,
        gemini,
        serper
      );

    const unicos =
      deduplicar(todos);

    unicos.sort(function(a, b) {
      return (
        (b.buyerIntentScore || b.score || 0) -
        (a.buyerIntentScore || a.score || 0)
      );
    });

    const resultadosFinais =
      unicos.slice(0, count);

    const alta =
      resultadosFinais.filter(function(r) {
        return r.buyerIntentLevel === 'alta';
      }).length;

    const media =
      resultadosFinais.filter(function(r) {
        return r.buyerIntentLevel === 'media';
      }).length;

    const baixa =
      resultadosFinais.filter(function(r) {
        return r.buyerIntentLevel === 'baixa';
      }).length;

    const comTelefone =
      resultadosFinais.filter(function(r) {
        return !!r.phone;
      }).length;

    const daCidade =
      resultadosFinais.filter(function(r) {
        return r.tipo_local === 'cidade';
      }).length;

    const doEstado =
      resultadosFinais.filter(function(r) {
        return r.tipo_local === 'estado';
      }).length;

    const nacionais =
      resultadosFinais.filter(function(r) {
        return r.tipo_local === 'nacional';
      }).length;

    const recomendadas =
      resultadosFinais.filter(function(r) {
        return (
          (r.buyerIntentScore || 0) >= 65
        );
      }).length;

    console.log(
      '>>> Radar finalizado: ' +
      resultadosFinais.length +
      ' oportunidades | ' +
      alta +
      ' alta intencao | ' +
      recomendadas +
      ' recomendadas'
    );

    return res.status(200).json({
      leads: resultadosFinais,

      meta: {
        intent: 'b2c_buyer_intent',

        summary:
          resultadosFinais.length +
          ' oportunidades encontradas → ' +
          alta +
          ' com intencao alta → ' +
          recomendadas +
          ' recomendadas para abordagem.',

        targetAudience:
          'Consumidores com manifestacoes publicas de interesse, pesquisa ou intencao de compra',

        estrategia:
          'RADAR DE COMPRADORES - priorizar oportunidades pela intencao demonstrada',

        modo_busca:
          'buyer-intent-radar',

        query: query,
        nicho: nicho,
        categoria:
          categoriaLegivel(nicho),

        radar: {
          oportunidades_encontradas:
            resultadosFinais.length,

          intencao_alta:
            alta,

          intencao_media:
            media,

          intencao_baixa:
            baixa,

          recomendadas_para_abordagem:
            recomendadas,

          // Será preenchido quando integrarmos
          // o Product Matcher/Shopee.
          produtos_correspondentes:
            0
        },

        resumo_geografico: {
          cidade: daCidade,
          estado: doEstado,
          nacional: nacionais,
          com_telefone: comTelefone
        },

        fontes_utilizadas: {
          facebook_groups:
            resultadosFinais.filter(
              function(r) {
                return r.source ===
                  'Facebook Groups';
              }
            ).length,

          serper:
            resultadosFinais.filter(
              function(r) {
                return r.source ===
                  'Google Search';
              }
            ).length,

          gemini:
            resultadosFinais.filter(
              function(r) {
                return r.grupo ===
                  'Gemini';
              }
            ).length
        },

        total_antes_deduplicacao:
          todos.length,

        integridade_dados: {
          dados_inventados: false,
          instagram_sintetico: false,
          telefone_sintetico: false,
          rating_sintetico: false,
          reviews_sinteticos: false
        }
      }
    });

  } catch (error) {
    console.error(
      'Erro geral B2C Buyer Intent:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Erro ao buscar oportunidades.'
    });
  }
}
