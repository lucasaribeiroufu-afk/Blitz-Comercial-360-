// ============================================================
// CEREBRO B2C v16: PROSPECCAO ATIVA Multi-nicho
// Estrategia: encontrar CONTATOS ATUANTES no mercado (nao so compradores)
// Fontes: Apify (Facebook Groups) + Serper + Gemini
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ACTOR_ID = 'apify~facebook-groups-scraper';

// ============================================================
// GRUPOS POR NICHO
// ============================================================
const GRUPOS_POR_NICHO = {
  agro: [
    { url: 'https://www.facebook.com/groups/1452587048167923/', nome: 'Pecuaria Brasil Oficial (49,7k)' },
    { url: 'https://www.facebook.com/groups/241762439745748/', nome: 'Gir Leiteiro Tesouro Brasileiro (40,7k)' },
    { url: 'https://www.facebook.com/groups/709798043065462/', nome: 'Os Menino da Pecuaria (29,3k)' },
    { url: 'https://www.facebook.com/groups/agropecuaria.grupo', nome: 'Agropecuaria (27,4k)' },
    { url: 'https://www.facebook.com/groups/1819571738357642/', nome: 'Agricultura e Pecuaria (24,5k)' },
    { url: 'https://www.facebook.com/groups/566066187358045/', nome: 'Pecuaria Forte Brasil (20k)' },
    { url: 'https://www.facebook.com/groups/207727399758306/', nome: 'Pecuaria no Brasil (12,4k)' },
    { url: 'https://www.facebook.com/groups/1993576477637899/', nome: 'O Melhor da Pecuaria Brasil (10,8k)' },
    { url: 'https://www.facebook.com/groups/2253608394913290/', nome: 'Pecuaria Leiteira e Corte Brasil (10k)' },
    { url: 'https://www.facebook.com/groups/1783696828448935/', nome: 'PECUARISTAS BRASIL (4,5k)' },
    { url: 'https://www.facebook.com/groups/122164784542624/', nome: 'pecuaria e pecuaristas (2,7k)' },
  ],
  casa: [],
  moda: [],
  agricola: [],
  eletronicos: []
};

// 🎯 Palavras que indicam ATUACAO no mercado (nao apenas compra)
const PALAVRAS_ATUACAO = [
  // Agro/pecuaria
  'gado', 'boi', 'vaca', 'novilha', 'bezerro', 'touro', 'matriz', 'reprodutor',
  'pecuaria', 'pecuarista', 'fazenda', 'sitio', 'chacara', 'rancho', 'estancia',
  'bovino', 'rebanho', 'criacao', 'engorda', 'confinamento', 'pastagem', 'pasto',
  'leite', 'leiteiro', 'ordenha', 'corte', 'abate', 'frigorifico',
  'racao', 'suplemento', 'sal mineral', 'premix', 'nutricao animal',
  'inseminacao', 'prenhez', 'leilao', 'arremate', 'lance',
  // Agricola
  'soja', 'milho', 'cafe', 'cana', 'sorgo', 'arroz', 'feijao',
  'plantio', 'safra', 'colheita', 'lavoura', 'agricola', 'agricultor',
  'fertilizante', 'adubo', 'defensivo', 'herbicida', 'fungicida',
  // Casa/decoracao
  'casa', 'decoracao', 'movel', 'sofa', 'mesa', 'cadeira', 'cozinha',
  // Moda
  'moda', 'roupa', 'vestido', 'blusa', 'calca', 'sapato', 'bolsa',
  // Eletronicos
  'celular', 'notebook', 'tablet', 'tv', 'eletrodomestico', 'geladeira'
];

// 🚫 Palavras que indicam SPAM (rejeitar)
const PALAVRAS_SPAM = [
  'advogado', 'advocacia', 'oab', 'cobranca', 'execucao', 'divida',
  'emprestimo', 'financiamento imobiliario', 'consorcio',
  'bitcoin', 'cripto', 'investimento garantido', 'renda extra',
  'curso online', 'e-book', 'ebook', 'mentoria', 'consultoria gratuita'
];

// 🚫 Palavras que indicam VENDEDOR profissional (rejeitar)
const PALAVRAS_VENDEDOR_PRO = [
  'loja oficial', 'site oficial', 'compre em nossa loja',
  'catalogo completo', 'tabela de precos', 'atacado e varejo',
  'entregamos em todo brasil', 'frete gratis acima', 'parcelamos em',
  'aceitamos cartao', 'pix com desconto', 'representante oficial'
];

const REGIAO_POR_ESTADO = {
  mg: 'sudeste', sp: 'sudeste', rj: 'sudeste', es: 'sudeste',
  pr: 'sul', sc: 'sul', rs: 'sul',
  go: 'centrooeste', mt: 'centrooeste', ms: 'centrooeste', df: 'centrooeste',
  ba: 'nordeste', pe: 'nordeste', ce: 'nordeste', rn: 'nordeste',
  pb: 'nordeste', al: 'nordeste', se: 'nordeste', pi: 'nordeste', ma: 'nordeste',
  am: 'norte', pa: 'norte', ac: 'norte', ro: 'norte', rr: 'norte', ap: 'norte', to: 'norte'
};

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function extrairTelefone(texto) {
  if (!texto) return null;
  const regex = /(?:\(?([1-9]{2})\)?\s*)?(9?\d{4})[-\s]?(\d{4})/g;
  const matches = texto.match(regex);
  if (!matches) return null;

  for (const m of matches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11) {
      const ddd = digits.slice(0, 2);
      if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99) {
        const numero = digits.slice(2);
        if (numero.length === 9) {
          return '(' + ddd + ') ' + numero.slice(0, 5) + '-' + numero.slice(5);
        } else if (numero.length === 8) {
          return '(' + ddd + ') ' + numero.slice(0, 4) + '-' + numero.slice(4);
        }
      }
    }
  }
  return null;
}

function detectarNicho(query) {
  const q = normalizar(query);
  if (q.indexOf('gado') !== -1 || q.indexOf('balanca') !== -1 || 
      q.indexOf('bovino') !== -1 || q.indexOf('pecuar') !== -1 ||
      q.indexOf('racao') !== -1 || q.indexOf('fazenda') !== -1 ||
      q.indexOf('boi') !== -1 || q.indexOf('vaca') !== -1 ||
      q.indexOf('leite') !== -1 || q.indexOf('corte') !== -1) return 'agro';
  if (q.indexOf('casa') !== -1 || q.indexOf('achadinho') !== -1 ||
      q.indexOf('utensilio') !== -1 || q.indexOf('decoracao') !== -1) return 'casa';
  if (q.indexOf('moda') !== -1 || q.indexOf('vestido') !== -1 ||
      q.indexOf('roupa') !== -1 || q.indexOf('feminin') !== -1) return 'moda';
  if (q.indexOf('fertilizante') !== -1 || q.indexOf('adubo') !== -1 ||
      q.indexOf('defensivo') !== -1 || q.indexOf('agricola') !== -1) return 'agricola';
  if (q.indexOf('eletron') !== -1 || q.indexOf('celular') !== -1 ||
      q.indexOf('iphone') !== -1 || q.indexOf('ventilador') !== -1) return 'eletronicos';
  return 'agro';
}

async function lerBodyRaw(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) {}
  }
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (rawBody) return JSON.parse(rawBody);
  } catch (e) {}
  return {};
}

// ============================================================
// CLASSIFICAR PROXIMIDADE GEOGRAFICA
// ============================================================
function classificarLocalizacao(texto, location) {
  if (!location) {
    return { score: 60, tipo_local: 'nacional', label_local: '🌎 Nacional', location: 'Brasil' };
  }

  const textoNorm = normalizar(texto);
  const cidadeAlvo = normalizar(location.split(',')[0]);
  const estadoAlvo = normalizar((location.split(',')[1] || '').trim());
  
  if (cidadeAlvo && textoNorm.indexOf(cidadeAlvo) !== -1) {
    return { score: 90, tipo_local: 'cidade', label_local: '📍 ' + location, location: location };
  }

  if (estadoAlvo && estadoAlvo.length >= 2 && textoNorm.indexOf(' ' + estadoAlvo + ' ') !== -1) {
    return { score: 80, tipo_local: 'estado', label_local: '🏛️ ' + estadoAlvo.toUpperCase(), location: 'Estado: ' + estadoAlvo.toUpperCase() };
  }

  const minhaRegiao = REGIAO_POR_ESTADO[estadoAlvo] || '';
  if (minhaRegiao) {
    const estadosRegiao = Object.keys(REGIAO_POR_ESTADO).filter(function(e) {
      return REGIAO_POR_ESTADO[e] === minhaRegiao;
    });
    for (const est of estadosRegiao) {
      if (textoNorm.indexOf(' ' + est + ' ') !== -1) {
        return { score: 70, tipo_local: 'regiao', label_local: '🗺️ Regiao ' + minhaRegiao, location: 'Regiao ' + minhaRegiao };
      }
    }
  }

  return { score: 60, tipo_local: 'nacional', label_local: '🌎 Nacional', location: 'Brasil' };
}

// ============================================================
// SCORE DE ATUACAO (nivel de atividade no mercado)
// ============================================================
function calcularScoreAtuacao(texto) {
  const textoNorm = normalizar(texto);
  let score = 0;
  let matches = 0;

  // 1. Menções a palavras de atuação (agro/pecuaria)
  PALAVRAS_ATUACAO.forEach(function(p) {
    if (textoNorm.indexOf(normalizar(p)) !== -1) {
      matches++;
    }
  });

  // 2. Post longo (>150 chars) = engajamento
  if (texto.length > 150) score += 10;
  if (texto.length > 300) score += 5;

  // 3. Menciona números específicos (quantidade, preço, data)
  if (/\d+\s*(cabe[cç]as?|hectares?|alqueires?|kg|toneladas?|reais|r\$)/i.test(texto)) score += 15;

  // 4. Menção a leilão/venda/compra em quantidade
  if (/(leil[aã]o|arremat|lance|comprar|vender|negociar)/i.test(texto)) score += 10;

  // 5. Menção a cidade/estado específico
  if (/(uberl[aâ]ndia|minas|goi[aá]s|mato grosso|paran[aá]|s[aã]o paulo|bahia)/i.test(texto)) score += 5;

  // 6. Pontuação por palavras de atuação
  score += Math.min(matches * 3, 30);

  return Math.min(score, 50);
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups (PROSPECCAO ATIVA)
// ============================================================
async function buscarFacebookGroups(query, location, nacional) {
  if (!APIFY_API_TOKEN) {
    console.warn('Apify: token nao configurado');
    return [];
  }

  try {
    const nicho = detectarNicho(query);
    const grupos = GRUPOS_POR_NICHO[nicho] || GRUPOS_POR_NICHO.agro;
    
    if (grupos.length === 0) {
      console.warn('Nenhum grupo para nicho: ' + nicho);
      return [];
    }

    console.log('Facebook Groups: "' + query + '" - nicho: ' + nicho);

    const url = 'https://api.apify.com/v2/acts/' + ACTOR_ID + '/run-sync-get-dataset-items?token=' + APIFY_API_TOKEN;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: grupos,
        maxPosts: 30,
        maxComments: 0,
        onlyPostsNewerThan: '2 months',
        viewOption: 'CHRONOLOGICAL'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Apify erro:', response.status, errText.slice(0, 300));
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];
    console.log('Facebook: ' + posts.length + ' posts brutos');

    const atuacaoNorm = PALAVRAS_ATUACAO.map(normalizar);
    const spamNorm = PALAVRAS_SPAM.map(normalizar);
    const vendProNorm = PALAVRAS_VENDEDOR_PRO.map(normalizar);
    
    // Termo específico da query (se houver)
    const termosQuery = normalizar(query)
      .split(' ')
      .filter(function(w) { return w.length > 3 && ['para', 'com', 'dos', 'das', 'de', 'da', 'do', 'em'].indexOf(w) === -1; });

    // 🎯 FILTRO: aceita ATUANTES, rejeita SPAM e VENDEDORES PROFISSIONAIS
    const filtrados = posts
      .filter(function(post) {
        const texto = normalizar(post.text || post.message || post.postText || '');
        
        if (texto.length < 20) return false; // muito curto
        
        // 🚫 Rejeitar SPAM
        const isSpam = spamNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (isSpam) return false;
        
        // 🚫 Rejeitar VENDEDOR PROFISSIONAL
        const isVendPro = vendProNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (isVendPro) return false;
        
        // ✅ Precisa ter ATUACAO no mercado (agro, casa, moda, etc)
        const temAtuacao = atuacaoNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (!temAtuacao) return false;
        
        return true;
      })
      .map(function(post) {
        const textoPost = post.text || post.message || post.postText || '';
        
        // Geolocalização
        const geo = classificarLocalizacao(textoPost, location);
        
        // Score de atuação (0-50)
        const scoreAtuacao = calcularScoreAtuacao(textoPost);
        
        // Telefone
        const telefone = extrairTelefone(textoPost);
        
        // Nome do autor
        const nomeAutor = (post.user && post.user.name) || 
                          (post.author && post.author.name) || 
                          post.authorName || 
                          post.userName ||
                          'Contato';

        // URL
        const urlPost = post.url || post.postUrl || post.facebookUrl || post.link || '';
        
        // Data
        let dataPost = new Date().toISOString().split('T')[0];
        if (post.time) {
          try { dataPost = new Date(post.time).toISOString().split('T')[0]; } catch (e) {}
        } else if (post.timestamp) {
          try { dataPost = new Date(post.timestamp * 1000).toISOString().split('T')[0]; } catch (e) {}
        }

        // 🎯 SCORE FINAL = Geo (0-90) + Atuacao (0-50) + Telefone bonus (0-10)
        let scoreFinal = geo.score + scoreAtuacao;
        if (telefone) scoreFinal += 10;
        if (nomeAutor && nomeAutor !== 'Contato') scoreFinal += 5;

        return {
          name: nomeAutor,
          phone: telefone || '',
          source: 'Facebook Groups',
          sourceUrl: urlPost,
          intent: textoPost.substring(0, 500),
          location: geo.location,
          tipo_local: geo.tipo_local,
          label_local: geo.label_local,
          date: dataPost,
          contact: telefone || null,
          score: Math.min(scoreFinal, 100),
          score_atuacao: scoreAtuacao,
          tem_telefone: !!telefone,
          tipo: 'active_contact',
          grupo: post.groupTitle || post.group || post.groupName || 'Grupo Facebook',
          observacao: 'Contato atuante no mercado - prospectar com link do site'
        };
      })
      .filter(function(p) { return p.sourceUrl && p.sourceUrl.indexOf('http') === 0; });

    filtrados.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

    const comTel = filtrados.filter(function(p) { return p.phone; }).length;
    console.log('Facebook: ' + filtrados.length + ' contatos atuantes (' + comTel + ' com tel)');
    return filtrados;

  } catch (err) {
    console.error('Erro Apify:', err.message);
    return [];
  }
}

// ============================================================
// FONTE 2: SERPER.DEV (busca mencoes de atuacao)
// ============================================================
async function buscarSerper(query, location, nacional) {
  if (!SERPER_API_KEY) return [];

  try {
    const q = (!nacional && location)
      ? '"pecuarista" OR "criador de gado" OR "fazendeiro" ' + location
      : '"pecuarista" OR "criador de gado" OR "fazendeiro"';

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: q, gl: 'br', hl: 'pt-br', num: 15 })
    });

    if (!response.ok) return [];
    const data = await response.json();
    const organic = data.organic || [];

    console.log('Serper: ' + organic.length + ' resultados');

    return organic.map(function(item) {
      const snippet = item.snippet || '';
      const telefone = extrairTelefone(snippet);
      const geo = classificarLocalizacao(snippet, location);
      
      return {
        name: item.title || 'Mencao',
        phone: telefone || '',
        source: item.displayLink || 'Google Search',
        sourceUrl: item.link || '',
        intent: snippet,
        location: geo.location,
        tipo_local: geo.tipo_local,
        label_local: geo.label_local,
        date: new Date().toISOString().split('T')[0],
        contact: telefone || null,
        score: Math.max(geo.score - 20, 30),
        score_atuacao: 10,
        tem_telefone: !!telefone,
        tipo: 'active_contact',
        grupo: 'Google',
        observacao: 'Contato atuante - prospectar'
      };
    });
  } catch (err) {
    console.error('Erro Serper:', err.message);
    return [];
  }
}

// ============================================================
// FONTE 3: GEMINI
// ============================================================
async function buscarGemini(query, location, nacional) {
  if (!GEMINI_API_KEY) return [];

  try {
    const localTexto = (!nacional && location) ? ' em ' + location : ' no Brasil';
    
    const prompt = 'Voce e um prospector B2B. Encontre CONTATOS ATUANTES no mercado agro/pecuario' + localTexto + ' que publiquem sobre: gado, fazenda, pecuaria, leilao, criacao, etc.\n\nNAO busque compradores. Busque PESSOAS ATUANTES do setor (produtores, criadores, fazendeiros, gestores rurais).\n\nFORMATO (array JSON):\n[{"name": "nome", "source": "site", "sourceUrl": "URL", "intent": "trecho", "location": "cidade/estado", "phone": "telefone se visivel", "date": "AAAA-MM-DD", "score": 60}]\n\nSe nao achar nada, retorne: []';

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    );

    if (!response.ok) return [];
    const data = await response.json();

    const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    if (!text) return [];

    let jsonText = text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];

    let resultados = [];
    try { resultados = JSON.parse(arrayMatch[0]); } catch (e) { return []; }
    if (!Array.isArray(resultados)) return [];

    return resultados
      .filter(function(r) { return r.sourceUrl && r.sourceUrl.indexOf('http') === 0; })
      .map(function(r) {
        const telefone = r.phone || extrairTelefone(r.intent || '');
        const geo = classificarLocalizacao(r.intent || '', location);
        return {
          name: r.name || 'Contato',
          phone: telefone || '',
          source: r.source || 'Gemini',
          sourceUrl: r.sourceUrl || '',
          intent: r.intent || '',
          location: geo.location,
          tipo_local: geo.tipo_local,
          label_local: geo.label_local,
          date: r.date || new Date().toISOString().split('T')[0],
          contact: telefone || null,
          score: Math.max(geo.score - 15, 35),
          score_atuacao: 15,
          tem_telefone: !!telefone,
          tipo: 'active_contact',
          grupo: 'Gemini',
          observacao: 'Contato atuante - prospectar'
        };
      });
  } catch (err) {
    console.error('Erro Gemini:', err.message);
    return [];
  }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const body = await lerBodyRaw(req);
  const query = body.query || '';
  const location = body.location || '';
  const count = body.count || 30;

  if (!query) return res.status(400).json({ error: 'Forneca o que deseja rastrear.' });

  try {
    console.log('===== B2C v16 PROSPECCAO ATIVA: "' + query + '" em ' + (location || 'Brasil') + ' =====');

    // Busca sempre nacional (grupos já são nacionais)
    const resultados = await Promise.all([
      buscarFacebookGroups(query, location, !location),
      buscarSerper(query, location, !location),
      buscarGemini(query, location, !location)
    ]);

    let todos = [].concat(resultados[0], resultados[2], resultados[1]);

    // Deduplicar por URL
    const vistos = {};
    const unicos = todos.filter(function(item) {
      if (!item.sourceUrl || vistos[item.sourceUrl]) return false;
      vistos[item.sourceUrl] = true;
      return true;
    });

    // Ordenar por score
    unicos.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

    const resultadosFinais = unicos.slice(0, count);
    const comTelefone = resultadosFinais.filter(function(r) { return r.phone; }).length;
    const daCidade = resultadosFinais.filter(function(r) { return r.tipo_local === 'cidade'; }).length;
    const doEstado = resultadosFinais.filter(function(r) { return r.tipo_local === 'estado'; }).length;
    const nacionais = resultadosFinais.filter(function(r) { return r.tipo_local === 'nacional'; }).length;

    console.log('Finalizado: ' + resultadosFinais.length + ' contatos (' + comTelefone + ' com tel)');

    res.status(200).json({
      leads: resultadosFinais,
      meta: {
        intent: 'b2c_active_prospecting',
        summary: resultadosFinais.length + ' CONTATOS ATUANTES no mercado de "' + query + '"' + (location ? ' (foco ' + location + ')' : '') + '. ' + comTelefone + ' com telefone direto. ' + daCidade + ' na cidade, ' + doEstado + ' no estado, ' + nacionais + ' nacionais.',
        targetAudience: 'Produtores, criadores e gestores rurais ATIVOS no mercado',
        estrategia: 'PROSPECCAO ATIVA - Enviar link do site para contatos atuantes',
        modo_busca: 'prospeccao-ativa',
        resumo_geografico: {
          cidade: daCidade,
          estado: doEstado,
          nacional: nacionais,
          com_telefone: comTelefone
        },
        fontes_utilizadas: {
          facebook_groups: resultadosFinais.filter(function(r) { return r.source === 'Facebook Groups'; }).length,
          serper: resultadosFinais.filter(function(r) { return r.source.indexOf('Google') !== -1; }).length,
          gemini: resultadosFinais.filter(function(r) { return r.source === 'Gemini'; }).length
        },
        total_antes_deduplicacao: todos.length
      }
    });

  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
