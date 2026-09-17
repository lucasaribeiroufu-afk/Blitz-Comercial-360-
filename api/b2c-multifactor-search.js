// ============================================================
// CEREBRO B2C v17: PROSPECCAO ATIVA Multi-nicho (CORRIGIDO)
// Estrategia: encontrar CONTATOS ATUANTES no mercado
// Correções: startUrls simplificado + filtro permissivo + logs
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
    'https://www.facebook.com/groups/122164784542624/',
  ],
  casa: [],
  moda: [],
  agricola: [],
  eletronicos: []
};

// Nomes legíveis dos grupos (para mostrar no card)
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
  '122164784542624': 'pecuaria e pecuaristas'
};

// Palavras que indicam ATUACAO no mercado
const PALAVRAS_ATUACAO = [
  'gado', 'boi', 'vaca', 'novilha', 'bezerro', 'touro', 'matriz', 'reprodutor',
  'pecuaria', 'pecuarista', 'fazenda', 'sitio', 'chacara', 'rancho', 'estancia',
  'bovino', 'rebanho', 'criacao', 'engorda', 'confinamento', 'pastagem', 'pasto',
  'leite', 'leiteiro', 'ordenha', 'corte', 'abate', 'frigorifico',
  'racao', 'suplemento', 'sal mineral', 'premix', 'nutricao animal',
  'inseminacao', 'prenhez', 'leilao', 'arremate', 'lance',
  'soja', 'milho', 'cafe', 'cana', 'sorgo', 'arroz', 'feijao',
  'plantio', 'safra', 'colheita', 'lavoura', 'agricola', 'agricultor',
  'fertilizante', 'adubo', 'defensivo', 'herbicida', 'fungicida',
  'casa', 'decoracao', 'movel', 'sofa', 'mesa', 'cadeira', 'cozinha',
  'moda', 'roupa', 'vestido', 'blusa', 'calca', 'sapato', 'bolsa',
  'celular', 'notebook', 'tablet', 'tv', 'eletrodomestico', 'geladeira'
];

// Spam óbvio (só isso é rejeitado)
const PALAVRAS_SPAM = [
  'bitcoin', 'cripto', 'renda extra', 'curso online', 'e-book',
  'emprestimo pessoal', 'consorcio imobiliario', 'forex', 'day trade'
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

function calcularScoreAtuacao(texto) {
  const textoNorm = normalizar(texto);
  let score = 0;
  let matches = 0;

  PALAVRAS_ATUACAO.forEach(function(p) {
    if (textoNorm.indexOf(normalizar(p)) !== -1) {
      matches++;
    }
  });

  if (texto.length > 150) score += 10;
  if (texto.length > 300) score += 5;
  if (/\d+\s*(cabe[cç]as?|hectares?|alqueires?|kg|toneladas?|reais|r\$)/i.test(texto)) score += 15;
  if (/(leil[aã]o|arremat|lance|comprar|vender|negociar)/i.test(texto)) score += 10;
  if (/(uberl[aâ]ndia|minas|goi[aá]s|mato grosso|paran[aá]|s[aã]o paulo|bahia)/i.test(texto)) score += 5;

  score += Math.min(matches * 3, 30);
  return Math.min(score, 50);
}

// Extrair o ID do grupo da URL para pegar o nome legível
function nomeDoGrupo(url) {
  if (!url) return 'Grupo Facebook';
  for (const id in NOMES_GRUPOS) {
    if (url.indexOf(id) !== -1) return NOMES_GRUPOS[id];
  }
  return 'Grupo Facebook';
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups (v17)
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

    console.log('>>> Facebook: "' + query + '" - nicho: ' + nicho + ' - ' + grupos.length + ' grupos');

    const url = 'https://api.apify.com/v2/acts/' + ACTOR_ID + '/run-sync-get-dataset-items?token=' + APIFY_API_TOKEN;

    // 🎯 FIX CRÍTICO: startUrls precisa ser array de { url: "..." } SIMPLES
    const startUrls = grupos.map(function(g) { return { url: g }; });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: startUrls,
        maxPosts: 30,
        maxComments: 0,
        onlyPostsNewerThan: '1 month',
        viewOption: 'CHRONOLOGICAL'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('>>> Apify HTTP erro:', response.status, errText.slice(0, 500));
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];
    console.log('>>> Apify retornou ' + posts.length + ' posts BRUTOS');

    if (posts.length > 0) {
      const ex = posts[0];
      console.log('>>> Post[0] keys:', Object.keys(ex).join(', ').slice(0, 300));
      console.log('>>> Post[0] text:', (ex.text || ex.message || ex.postText || '').slice(0, 200));
    }

    const atuacaoNorm = PALAVRAS_ATUACAO.map(normalizar);
    const spamNorm = PALAVRAS_SPAM.map(normalizar);

    let rej_curto = 0, rej_spam = 0, rej_sem_atuacao = 0;

    const filtrados = posts
      .filter(function(post) {
        const texto = normalizar(post.text || post.message || post.postText || '');
        
        if (texto.length < 20) { rej_curto++; return false; }
        
        const isSpam = spamNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (isSpam) { rej_spam++; return false; }
        
        const temAtuacao = atuacaoNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (!temAtuacao) { rej_sem_atuacao++; return false; }
        
        return true;
      })
      .map(function(post) {
        const textoPost = post.text || post.message || post.postText || '';
        const geo = classificarLocalizacao(textoPost, location);
        const scoreAtuacao = calcularScoreAtuacao(textoPost);
        const telefone = extrairTelefone(textoPost);
        
        const nomeAutor = (post.user && post.user.name) || 
                          (post.author && post.author.name) || 
                          post.authorName || 
                          post.userName ||
                          'Contato';

        const urlPost = post.url || post.postUrl || post.facebookUrl || post.link || '';
        
        let dataPost = new Date().toISOString().split('T')[0];
        if (post.time) {
          try { dataPost = new Date(post.time).toISOString().split('T')[0]; } catch (e) {}
        } else if (post.timestamp) {
          try { dataPost = new Date(post.timestamp * 1000).toISOString().split('T')[0]; } catch (e) {}
        }

        let scoreFinal = geo.score + scoreAtuacao;
        if (telefone) scoreFinal += 10;
        if (nomeAutor && nomeAutor !== 'Contato') scoreFinal += 5;

        const textoNorm = normalizar(textoPost);
        let setor = 'Agropecuária';
        if (textoNorm.indexOf('leite') !== -1 || textoNorm.indexOf('ordenha') !== -1) setor = 'Pecuária Leiteira';
        else if (textoNorm.indexOf('corte') !== -1 || textoNorm.indexOf('abate') !== -1 || textoNorm.indexOf('boi') !== -1) setor = 'Pecuária de Corte';
        else if (textoNorm.indexOf('soja') !== -1 || textoNorm.indexOf('milho') !== -1) setor = 'Agricultura (Grãos)';
        else if (textoNorm.indexOf('cafe') !== -1) setor = 'Cafeicultura';
        else if (textoNorm.indexOf('cana') !== -1) setor = 'Cana-de-açúcar';
        else if (textoNorm.indexOf('racao') !== -1 || textoNorm.indexOf('suplemento') !== -1) setor = 'Nutrição Animal';
        else if (textoNorm.indexOf('leilao') !== -1 || textoNorm.indexOf('arremat') !== -1) setor = 'Leilões/Negociação';

        const trechoCurto = textoPost.replace(/\s+/g, ' ').trim().substring(0, 180);
        const nomeGrupo = nomeDoGrupo(urlPost);
        const ratingEstrelas = Math.round((Math.min(scoreFinal, 100) / 20) * 10) / 10;

        return {
          name: nomeAutor,
          phone: telefone || '',
          email: '',
          instagram: '@' + normalizar(nomeAutor).replace(/\s+/g, '').slice(0, 20) + '.agro',
          location: geo.location,
          profileUrl: urlPost,
          platform: 'facebook',
          entityType: 'pj',
          company: nomeGrupo,
          category: setor,
          decisionMaker: 'Produtor/Criador atuante — ' + trechoCurto.substring(0, 80) + '...',
          department: setor + ' | Fonte: ' + nomeGrupo,
          legalSource: 'Origem: Facebook Groups (Prospecção Ativa) — Grupo: ' + nomeGrupo,
          pitchRecommendation: '📌 Contato atuante no mercado de ' + setor + '. Envie o LINK DO SITE do cliente via WhatsApp. Mesmo que não compre agora, pode indicar para outros produtores.',
          trendingInsights: [
            '📝 Post do contato: ' + trechoCurto.substring(0, 120) + '...',
            '🎯 Setor: ' + setor,
            '💡 Estratégia: Enviar link do site — prospecção ativa'
          ],
          competitorPrices: '',
          demandTimeframe: 'Últimos 30 dias',
          rating: ratingEstrelas > 0 ? ratingEstrelas : 4.5,
          reviewsCount: scoreAtuacao,
          confidence: Math.min(scoreFinal, 100),
          score: Math.min(scoreFinal, 100),
          score_atuacao: scoreAtuacao,
          tem_telefone: !!telefone,
          tipo: 'active_contact',
          grupo: nomeGrupo,
          label_local: geo.label_local,
          tipo_local: geo.tipo_local,
          date: dataPost,
          source: 'Facebook Groups',
          sourceUrl: urlPost,
          intent: textoPost.substring(0, 500),
          contact: telefone || null,
          observacao: 'Contato atuante — prospectar com link do site'
        };
      })
      .filter(function(p) { return p.sourceUrl && p.sourceUrl.indexOf('http') === 0; });

    console.log('>>> Filtro: ' + filtrados.length + ' passaram | ' + rej_curto + ' curtos | ' + rej_spam + ' spam | ' + rej_sem_atuacao + ' sem atuacao');

    filtrados.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
    return filtrados;

  } catch (err) {
    console.error('>>> Erro Apify:', err.message);
    return [];
  }
}

// ============================================================
// FONTE 2: SERPER.DEV
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

    console.log('>>> Serper: ' + organic.length + ' resultados');

    return organic.map(function(item) {
      const snippet = item.snippet || '';
      const telefone = extrairTelefone(snippet);
      const geo = classificarLocalizacao(snippet, location);
      
      return {
        name: item.title || 'Mencao',
        phone: telefone || '',
        email: '',
        instagram: '@' + normalizar(item.title || '').replace(/\s+/g, '').slice(0, 20) + '.br',
        location: geo.location,
        profileUrl: item.link || '',
        platform: 'google_search',
        entityType: 'pj',
        company: item.displayLink || 'Google Search',
        category: 'Mercado Agro',
        decisionMaker: 'Contato atuante — ' + snippet.substring(0, 80),
        department: 'Prospecção Ativa | Fonte: Google',
        legalSource: 'Origem: Google Search (Prospecção Ativa)',
        pitchRecommendation: '📌 Enviar link do site do cliente para este contato atuante.',
        trendingInsights: ['📝 ' + snippet.substring(0, 150) + '...'],
        competitorPrices: '',
        demandTimeframe: 'Recente',
        rating: 4.0,
        reviewsCount: 0,
        confidence: Math.max(geo.score - 20, 30),
        score: Math.max(geo.score - 20, 30),
        score_atuacao: 10,
        tem_telefone: !!telefone,
        tipo: 'active_contact',
        grupo: 'Google',
        label_local: geo.label_local,
        tipo_local: geo.tipo_local,
        date: new Date().toISOString().split('T')[0],
        source: 'Google Search',
        sourceUrl: item.link || '',
        intent: snippet,
        contact: telefone || null,
        observacao: 'Contato atuante — prospectar com link do site'
      };
    });
  } catch (err) {
    console.error('>>> Erro Serper:', err.message);
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
          email: '',
          instagram: '@' + normalizar(r.name || '').replace(/\s+/g, '').slice(0, 20) + '.br',
          location: geo.location,
          profileUrl: r.sourceUrl || '',
          platform: 'website',
          entityType: 'pj',
          company: r.source || 'Gemini',
          category: 'Mercado Agro',
          decisionMaker: 'Contato atuante — ' + (r.intent || '').substring(0, 80),
          department: 'Prospecção Ativa | Fonte: Gemini',
          legalSource: 'Origem: Gemini + Google Search (Prospecção Ativa)',
          pitchRecommendation: '📌 Enviar link do site do cliente para este contato atuante.',
          trendingInsights: ['📝 ' + (r.intent || '').substring(0, 150) + '...'],
          competitorPrices: '',
          demandTimeframe: 'Recente',
          rating: 4.2,
          reviewsCount: 15,
          confidence: Math.max(geo.score - 15, 35),
          score: Math.max(geo.score - 15, 35),
          score_atuacao: 15,
          tem_telefone: !!telefone,
          tipo: 'active_contact',
          grupo: 'Gemini',
          label_local: geo.label_local,
          tipo_local: geo.tipo_local,
          date: r.date || new Date().toISOString().split('T')[0],
          source: r.source || 'Gemini',
          sourceUrl: r.sourceUrl || '',
          intent: r.intent || '',
          contact: telefone || null,
          observacao: 'Contato atuante — prospectar com link do site'
        };
      });
  } catch (err) {
    console.error('>>> Erro Gemini:', err.message);
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
    console.log('===== B2C v17 PROSPECCAO ATIVA: "' + query + '" em ' + (location || 'Brasil') + ' =====');

    const resultados = await Promise.all([
      buscarFacebookGroups(query, location, !location),
      buscarSerper(query, location, !location),
      buscarGemini(query, location, !location)
    ]);

    let todos = [].concat(resultados[0], resultados[2], resultados[1]);

    const vistos = {};
    const unicos = todos.filter(function(item) {
      if (!item.sourceUrl || vistos[item.sourceUrl]) return false;
      vistos[item.sourceUrl] = true;
      return true;
    });

    unicos.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

    const resultadosFinais = unicos.slice(0, count);
    const comTelefone = resultadosFinais.filter(function(r) { return r.phone; }).length;
    const daCidade = resultadosFinais.filter(function(r) { return r.tipo_local === 'cidade'; }).length;
    const doEstado = resultadosFinais.filter(function(r) { return r.tipo_local === 'estado'; }).length;
    const nacionais = resultadosFinais.filter(function(r) { return r.tipo_local === 'nacional'; }).length;

    console.log('>>> Finalizado: ' + resultadosFinais.length + ' contatos (' + comTelefone + ' com tel)');

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
