// ============================================================
// CEREBRO B2C v13: Radar de Intencao de Compra MULTI-NICHO
// Fontes: Apify (Facebook Groups OFICIAL) + Serper + Gemini
// 11 grupos de agro cadastrados (~231 mil pessoas)
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ACTOR_ID = 'apify~facebook-groups-scraper';

// ============================================================
// GRUPOS CADASTRADOS POR NICHO
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

const KEYWORDS_COMPRA = [
  'quero comprar', 'quero adquirir', 'estou procurando', 'estou buscando',
  'onde compro', 'onde encontro', 'onde acho',
  'procuro por', 'estou a procura', 'a procura de',
  'preciso de', 'preciso comprar', 'necessito de',
  'indicacao de', 'indica pra mim', 'alguem indica', 'me indica',
  'qual melhor', 'me ajudem a encontrar', 'conhece alguem que vende',
  'alguem tem para vender', 'alguem sabe onde', 'sabe onde encontro',
  'to precisando', 'estou precisando'
];

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
      q.indexOf('leite') !== -1 || q.indexOf('corte') !== -1) {
    return 'agro';
  }
  if (q.indexOf('casa') !== -1 || q.indexOf('achadinho') !== -1 ||
      q.indexOf('utensilio') !== -1 || q.indexOf('decoracao') !== -1) {
    return 'casa';
  }
  if (q.indexOf('moda') !== -1 || q.indexOf('vestido') !== -1 ||
      q.indexOf('roupa') !== -1 || q.indexOf('feminin') !== -1) {
    return 'moda';
  }
  if (q.indexOf('fertilizante') !== -1 || q.indexOf('adubo') !== -1 ||
      q.indexOf('defensivo') !== -1 || q.indexOf('agricola') !== -1) {
    return 'agricola';
  }
  if (q.indexOf('eletron') !== -1 || q.indexOf('celular') !== -1 ||
      q.indexOf('iphone') !== -1 || q.indexOf('ventilador') !== -1) {
    return 'eletronicos';
  }
  
  return 'agro';
}

// ============================================================
// LER BODY RAW (fix para Vercel que nao parseia JSON)
// ============================================================
async function lerBodyRaw(req) {
  // Tentativa 1: req.body ja e objeto
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('Body veio parseado do Vercel:', JSON.stringify(req.body).slice(0, 300));
    return req.body;
  }

  // Tentativa 2: req.body e string JSON
  if (req.body && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      console.log('Body veio como string, parseado:', JSON.stringify(parsed).slice(0, 300));
      return parsed;
    } catch (e) {
      console.error('Erro parse string body:', e.message);
    }
  }

  // Tentativa 3: ler stream raw
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    console.log('Body lido do stream RAW:', rawBody.slice(0, 300));
    
    if (rawBody) {
      return JSON.parse(rawBody);
    }
  } catch (e) {
    console.error('Erro ao ler stream raw:', e.message);
  }

  return {};
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups (ator oficial)
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
      console.warn('Nenhum grupo cadastrado para nicho: ' + nicho);
      return [];
    }

    const modoBusca = nacional ? 'NACIONAL' : (location || 'BRASIL');
    console.log('Facebook Groups (' + modoBusca + '): "' + query + '" - nicho: ' + nicho + ' - ' + grupos.length + ' grupos');

    const url = 'https://api.apify.com/v2/acts/' + ACTOR_ID + '/run-sync-get-dataset-items?token=' + APIFY_API_TOKEN;

    const payloadApify = {
      startUrls: grupos,
      maxPosts: 30,
      maxComments: 0,
      onlyPostsNewerThan: '1 month',
      viewOption: 'CHRONOLOGICAL'
    };

    console.log('Payload Apify:', JSON.stringify(payloadApify).slice(0, 500));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadApify)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Apify Facebook erro:', response.status, errText.slice(0, 800));
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];
    console.log('Facebook Groups: ' + posts.length + ' posts brutos');

    if (posts.length > 0) {
      console.log('Exemplo post[0]:', JSON.stringify(posts[0]).slice(0, 400));
    }

    const keywordsNorm = KEYWORDS_COMPRA.map(normalizar);

    const termosQuery = normalizar(query)
      .split(' ')
      .filter(function(w) { 
        return w.length > 3 && 
               ['para', 'com', 'dos', 'das', 'de', 'da', 'do', 'em', 'comprador', 'pesagem'].indexOf(w) === -1; 
      });

    console.log('Termos especificos da query:', termosQuery.join(', '));

    const filtrados = posts
      .filter(function(post) {
        const texto = normalizar(post.text || post.message || post.postText || '');
        
        const temIntencao = keywordsNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (!temIntencao) return false;
        
        if (termosQuery.length > 0) {
          const temTermoQuery = termosQuery.some(function(t) { return texto.indexOf(t) !== -1; });
          if (!temTermoQuery) return false;
        }
        
        return true;
      })
      .map(function(post) {
        const textoPost = post.text || post.message || post.postText || '';
        const textoNorm = normalizar(textoPost);
        
        const mencionaLocal = (!nacional && location)
          ? textoNorm.indexOf(normalizar(location.split(',')[0])) !== -1
          : false;

        const telefone = extrairTelefone(textoPost);

        const nomeAutor = (post.user && post.user.name) || 
                          (post.author && post.author.name) || 
                          post.authorName || 
                          post.userName ||
                          'Comprador';

        const urlPost = post.url || post.postUrl || post.facebookUrl || post.link || '';

        let dataPost = new Date().toISOString().split('T')[0];
        if (post.time) {
          try {
            dataPost = new Date(post.time).toISOString().split('T')[0];
          } catch (e) {}
        } else if (post.timestamp) {
          try {
            dataPost = new Date(post.timestamp * 1000).toISOString().split('T')[0];
          } catch (e) {}
        }

        return {
          name: nomeAutor,
          phone: telefone || '',
          source: 'Facebook Groups',
          sourceUrl: urlPost,
          intent: textoPost.substring(0, 400),
          location: mencionaLocal ? location : 'Brasil',
          date: dataPost,
          contact: telefone || null,
          score: mencionaLocal ? 98 : (nacional ? 90 : 95),
          tipo: 'buyer_intent',
          grupo: post.groupTitle || post.group || post.groupName || 'Grupo Facebook'
        };
      })
      .filter(function(p) { return p.sourceUrl && p.sourceUrl.indexOf('http') === 0; });

    if (!nacional && location) {
      const regionais = filtrados.filter(function(p) { return p.score === 98; });
      console.log('Facebook Groups: ' + regionais.length + ' regionais / ' + filtrados.length + ' total');
      return regionais.length > 0 ? regionais : filtrados;
    }

    console.log('Facebook Groups: ' + filtrados.length + ' com intencao');
    return filtrados;

  } catch (err) {
    console.error('Erro Apify:', err.message, err.stack);
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
      ? '"quero comprar" OR "onde compro" "' + query + '" ' + location
      : '"quero comprar" OR "onde compro" "' + query + '"';

    const modoBusca = nacional ? 'NACIONAL' : (location || 'BRASIL');
    console.log('Serper (' + modoBusca + '): "' + q + '"');

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
      
      return {
        name: item.title || 'Mencao',
        phone: telefone || '',
        source: item.displayLink || 'Google Search',
        sourceUrl: item.link || '',
        intent: snippet,
        location: (!nacional && location) ? location : 'Brasil',
        date: new Date().toISOString().split('T')[0],
        contact: telefone || null,
        score: nacional ? 65 : 70,
        tipo: 'search_result',
        grupo: 'Google'
      };
    });
  } catch (err) {
    console.error('Erro Serper:', err.message);
    return [];
  }
}

// ============================================================
// FONTE 3: GEMINI + Google Search
// ============================================================
async function buscarGemini(query, location, nacional) {
  if (!GEMINI_API_KEY) return [];

  try {
    const localTexto = (!nacional && location) ? ' em ' + location : ' no Brasil';
    
    const prompt = 'Voce e um rastreador de INTENCAO DE COMPRA. Busque na web mencoes publicas de pessoas procurando comprar "' + query + '"' + localTexto + '.\n\nREGRAS:\n- Retorne APENAS compradores (quem quer comprar, procura, pergunta onde encontrar)\n- NAO retorne lojas, e-commerce, catalogos, fabricantes\n- Priorize: Facebook, foruns, Reddit, Instagram, Twitter/X\n\nFORMATO (retorne APENAS array JSON, sem markdown):\n[{"name": "nome ou Comprador", "source": "site", "sourceUrl": "URL completa", "intent": "trecho exato da mencao", "location": "cidade/estado", "phone": "telefone se visivel no texto", "date": "AAAA-MM-DD", "score": 80}]\n\nSe nao achar nada, retorne: []';

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
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];

    let resultados = [];
    try { resultados = JSON.parse(arrayMatch[0]); } catch (e) { return []; }
    if (!Array.isArray(resultados)) return [];

    const leads = resultados
      .filter(function(r) { return r.sourceUrl && r.sourceUrl.indexOf('http') === 0; })
      .map(function(r) {
        const telefone = r.phone || extrairTelefone(r.intent || '');
        return {
          name: r.name || 'Comprador',
          phone: telefone || '',
          source: r.source || 'Gemini',
          sourceUrl: r.sourceUrl || '',
          intent: r.intent || '',
          location: r.location || ((!nacional && location) ? location : 'Brasil'),
          date: r.date || new Date().toISOString().split('T')[0],
          contact: telefone || null,
          score: nacional ? 75 : 80,
          tipo: 'buyer_intent',
          grupo: 'Gemini'
        };
      });

    console.log('Gemini: ' + leads.length + ' mencoes');
    return leads;
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

  console.log('=== Handler iniciado ===');
  console.log('Method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);

  // 🎯 LER BODY (robusto)
  const body = await lerBodyRaw(req);

  const query = body.query || '';
  const location = body.location || '';
  const count = body.count || 20;

  console.log('Query extraida:', query);
  console.log('Location:', location);

  if (!query) return res.status(400).json({ error: 'Forneca o que deseja rastrear.' });

  try {
    console.log('===== B2C v13: "' + query + '" em ' + (location || 'Brasil') + ' =====');

    let todos = [];
    let modoUsado = 'nacional';

    if (location && location.trim()) {
      console.log('FASE 1: Regional em ' + location);
      
      const resultados = await Promise.all([
        buscarFacebookGroups(query, location, false),
        buscarSerper(query, location, false),
        buscarGemini(query, location, false)
      ]);

      todos = [].concat(resultados[0], resultados[2], resultados[1]);
      modoUsado = 'regional';

      console.log('Regional: ' + todos.length + ' leads');
    }

    if (todos.length < 5) {
      console.log('Fallback NACIONAL...');

      const resultadosNac = await Promise.all([
        buscarFacebookGroups(query, '', true),
        buscarSerper(query, '', true),
        buscarGemini(query, '', true)
      ]);

      const todosNacional = [].concat(resultadosNac[0], resultadosNac[2], resultadosNac[1]);
      console.log('Nacional: ' + todosNacional.length + ' leads');

      if (todos.length > 0) {
        todos = todos.concat(todosNacional);
        modoUsado = 'regional + nacional';
      } else {
        todos = todosNacional;
        modoUsado = 'nacional';
      }
    }

    const vistos = {};
    const unicos = todos.filter(function(item) {
      if (!item.sourceUrl || vistos[item.sourceUrl]) return false;
      vistos[item.sourceUrl] = true;
      return true;
    });

    unicos.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

    const resultados = unicos.slice(0, count);
    const comTelefone = resultados.filter(function(r) { return r.phone; }).length;

    const fontes = {
      facebook_groups: resultados.filter(function(r) { return r.source === 'Facebook Groups'; }).length,
      serper: resultados.filter(function(r) { return r.source.indexOf('Google') !== -1; }).length,
      gemini: resultados.filter(function(r) { return r.source === 'Gemini'; }).length,
      com_telefone: comTelefone
    };

    console.log('===== Finalizado: ' + resultados.length + ' leads (' + comTelefone + ' com tel) =====');

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: resultados.length + ' leads para "' + query + '"' + (location ? ' em ' + location : '') + ' (modo: ' + modoUsado + '). ' + comTelefone + ' com telefone.',
        targetAudience: 'Pessoas com intencao de compra',
        modo_busca: modoUsado,
        fontes_utilizadas: fontes,
        total_antes_deduplicacao: todos.length
      }
    });

  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
