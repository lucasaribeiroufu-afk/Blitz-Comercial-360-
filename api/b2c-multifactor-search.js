// ============================================================
// CEREBRO B2C v15: Radar de Intencao de Compra MULTI-NICHO
// Comportamento HIBRIDO: 3+ regionais = so regionais
//                        <3 regionais = regionais + nacionais com badges
// Fontes: Apify (Facebook Groups OFICIAL) + Serper + Gemini
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

// Palavras-chave de intencao de compra (frases completas)
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

// Palavras que indicam VENDEDOR (excluir)
const KEYWORDS_VENDEDOR = [
  'a venda', 'vende-se', 'vendo ', 'vendemos',
  'oportunidade de investimento', 'excelente oportunidade',
  'fazenda a venda', 'fazenda para venda', 'sitio a venda',
  'terreno a venda', 'area a venda', 'propriedade a venda',
  'leilao', 'lance inicial', 'avaliacao',
  'catalogo', 'tabela de preco', 'consulte valores', 'sob consulta'
];

// Mapa de regioes brasileiras
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
// LER BODY RAW (fix para Vercel)
// ============================================================
async function lerBodyRaw(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('Body parseado:', JSON.stringify(req.body).slice(0, 200));
    return req.body;
  }

  if (req.body && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      console.log('Body string parseado:', JSON.stringify(parsed).slice(0, 200));
      return parsed;
    } catch (e) {
      console.error('Erro parse string:', e.message);
    }
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    console.log('Body RAW:', rawBody.slice(0, 300));
    
    if (rawBody) {
      return JSON.parse(rawBody);
    }
  } catch (e) {
    console.error('Erro stream raw:', e.message);
  }

  return {};
}

// ============================================================
// CLASSIFICAR PROXIMIDADE GEOGRAFICA
// ============================================================
function classificarLocalizacao(texto, location) {
  if (!location) {
    return { score: 80, tipo_local: 'nacional', label_local: '🌎 Nacional', location: 'Brasil' };
  }

  const textoNorm = normalizar(texto);
  const cidadeAlvo = normalizar(location.split(',')[0]);            // "uberlandia"
  const estadoAlvo = normalizar((location.split(',')[1] || '').trim()); // "mg"
  
  // Nivel 1: Menciona a CIDADE (score 98)
  if (cidadeAlvo && textoNorm.indexOf(cidadeAlvo) !== -1) {
    return { score: 98, tipo_local: 'cidade', label_local: '📍 ' + location, location: location };
  }

  // Nivel 2: Menciona o ESTADO (score 92)
  if (estadoAlvo && estadoAlvo.length >= 2 && textoNorm.indexOf(' ' + estadoAlvo + ' ') !== -1) {
    return { score: 92, tipo_local: 'estado', label_local: '🏛️ ' + estadoAlvo.toUpperCase(), location: 'Estado: ' + estadoAlvo.toUpperCase() };
  }

  // Nivel 3: Menciona a REGIAO (score 88)
  const minhaRegiao = REGIAO_POR_ESTADO[estadoAlvo] || '';
  if (minhaRegiao) {
    const estadosRegiao = Object.keys(REGIAO_POR_ESTADO).filter(function(e) {
      return REGIAO_POR_ESTADO[e] === minhaRegiao;
    });
    for (const est of estadosRegiao) {
      if (textoNorm.indexOf(' ' + est + ' ') !== -1) {
        return { score: 88, tipo_local: 'regiao', label_local: '🗺️ Regiao ' + minhaRegiao, location: 'Regiao ' + minhaRegiao };
      }
    }
  }

  // Nivel 4: Nacional (score 80)
  return { score: 80, tipo_local: 'nacional', label_local: '🌎 Nacional', location: 'Brasil' };
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups (HIBRIDO)
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

    const modoBusca = nacional ? 'NACIONAL' : (location || 'BRASIL');
    console.log('Facebook Groups (' + modoBusca + '): "' + query + '" - nicho: ' + nicho);

    const url = 'https://api.apify.com/v2/acts/' + ACTOR_ID + '/run-sync-get-dataset-items?token=' + APIFY_API_TOKEN;

    const payloadApify = {
      startUrls: grupos,
      maxPosts: 30,
      maxComments: 0,
      onlyPostsNewerThan: '1 month',
      viewOption: 'CHRONOLOGICAL'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadApify)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Apify erro:', response.status, errText.slice(0, 400));
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];
    console.log('Facebook: ' + posts.length + ' posts brutos');

    const keywordsNorm = KEYWORDS_COMPRA.map(normalizar);
    const vendedorNorm = KEYWORDS_VENDEDOR.map(normalizar);

    const termosQuery = normalizar(query)
      .split(' ')
      .filter(function(w) { 
        return w.length > 3 && 
               ['para', 'com', 'dos', 'das', 'de', 'da', 'do', 'em', 'comprador', 'pesagem'].indexOf(w) === -1; 
      });

    const termoPrincipal = termosQuery[0] || '';
    console.log('Termos query:', termosQuery.join(', '), '| Principal:', termoPrincipal);

    // 🎯 Filtro + classificacao geografica
    const filtrados = posts
      .filter(function(post) {
        const texto = normalizar(post.text || post.message || post.postText || '');
        
        // 1. Precisa ter frase de intencao de compra
        const temIntencao = keywordsNorm.some(function(k) { return texto.indexOf(k) !== -1; });
        if (!temIntencao) return false;
        
        // 2. Rejeitar vendedores
        const temVendedor = vendedorNorm.some(function(v) { return texto.indexOf(v) !== -1; });
        if (temVendedor) return false;
        
        // 3. Precisa ter o termo principal
        if (termoPrincipal && texto.indexOf(termoPrincipal) === -1) return false;
        
        return true;
      })
      .map(function(post) {
        const textoPost = post.text || post.message || post.postText || '';
        
        // Classifica localizacao
        const geo = classificarLocalizacao(textoPost, location);

        const telefone = extrairTelefone(textoPost);

        const nomeAutor = (post.user && post.user.name) || 
                          (post.author && post.author.name) || 
                          post.authorName || 
                          post.userName ||
                          'Comprador';

        const urlPost = post.url || post.postUrl || post.facebookUrl || post.link || '';

        let dataPost = new Date().toISOString().split('T')[0];
        if (post.time) {
          try { dataPost = new Date(post.time).toISOString().split('T')[0]; } catch (e) {}
        } else if (post.timestamp) {
          try { dataPost = new Date(post.timestamp * 1000).toISOString().split('T')[0]; } catch (e) {}
        }

        return {
          name: nomeAutor,
          phone: telefone || '',
          source: 'Facebook Groups',
          sourceUrl: urlPost,
          intent: textoPost.substring(0, 400),
          location: geo.location,
          tipo_local: geo.tipo_local,
          label_local: geo.label_local,
          date: dataPost,
          contact: telefone || null,
          score: geo.score,
          tipo: 'buyer_intent',
          grupo: post.groupTitle || post.group || post.groupName || 'Grupo Facebook'
        };
      })
      .filter(function(p) { return p.sourceUrl && p.sourceUrl.indexOf('http') === 0; });

    // 🎯 COMPORTAMENTO HIBRIDO
    if (!nacional && location) {
      filtrados.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

      const regionais = filtrados.filter(function(p) { return p.tipo_local === 'cidade' || p.tipo_local === 'estado'; });
      const regionaisFortes = filtrados.filter(function(p) { return p.tipo_local === 'cidade'; });

      console.log('Facebook: ' + regionaisFortes.length + ' cidade / ' + regionais.length + ' estado / ' + filtrados.length + ' total');

      // HIBRIDO: se 3+ na cidade, retorna SO eles
      if (regionaisFortes.length >= 3) {
        console.log('🎯 Modo RIGOROSO: ' + regionaisFortes.length + ' leads em ' + location);
        return regionaisFortes;
      }

      // Senao, retorna TUDO (regionais + nacionais) com badges
      console.log('🌎 Modo HIBRIDO: regionais + nacionais (badges)');
      return filtrados;
    }

    filtrados.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
    return filtrados;

  } catch (err) {
    console.error('Erro Apify:', err.message);
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
        score: geo.score - 15,
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
// FONTE 3: GEMINI
// ============================================================
async function buscarGemini(query, location, nacional) {
  if (!GEMINI_API_KEY) return [];

  try {
    const localTexto = (!nacional && location) ? ' em ' + location : ' no Brasil';
    
    const prompt = 'Voce e um rastreador de INTENCAO DE COMPRA. Busque na web mencoes publicas de pessoas procurando comprar "' + query + '"' + localTexto + '.\n\nREGRAS:\n- Retorne APENAS compradores (quem quer comprar, procura, pergunta onde encontrar)\n- NAO retorne lojas, e-commerce, catalogos, fabricantes\n- Priorize: Facebook, foruns, Reddit, Instagram, Twitter/X\n\nFORMATO (retorne APENAS array JSON):\n[{"name": "nome", "source": "site", "sourceUrl": "URL", "intent": "trecho", "location": "cidade/estado", "phone": "telefone se visivel", "date": "AAAA-MM-DD", "score": 80}]\n\nSe nao achar nada, retorne: []';

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
        const geo = classificarLocalizacao(r.intent || '', location);
        return {
          name: r.name || 'Comprador',
          phone: telefone || '',
          source: r.source || 'Gemini',
          sourceUrl: r.sourceUrl || '',
          intent: r.intent || '',
          location: geo.location,
          tipo_local: geo.tipo_local,
          label_local: geo.label_local,
          date: r.date || new Date().toISOString().split('T')[0],
          contact: telefone || null,
          score: geo.score - 10,
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

  const body = await lerBodyRaw(req);
  const query = body.query || '';
  const location = body.location || '';
  const count = body.count || 20;

  if (!query) return res.status(400).json({ error: 'Forneca o que deseja rastrear.' });

  try {
    console.log('===== B2C v15: "' + query + '" em ' + (location || 'Brasil') + ' =====');

    let todos = [];
    let modoUsado = 'regional';

    // FASE 1: Busca (regional se location, senao nacional)
    const resultados = await Promise.all([
      buscarFacebookGroups(query, location, !location),
      buscarSerper(query, location, !location),
      buscarGemini(query, location, !location)
    ]);

    todos = [].concat(resultados[0], resultados[2], resultados[1]);

    // FASE 2: Fallback nacional se poucos resultados E tinha location
    const cidadeLeads = todos.filter(function(l) { return l.tipo_local === 'cidade'; });

    if (location && cidadeLeads.length < 3 && todos.length < 5) {
      console.log('Fallback NACIONAL adicional...');
      modoUsado = 'regional + nacional';

      const resultadosNac = await Promise.all([
        buscarFacebookGroups(query, '', true),
        buscarSerper(query, '', true),
        buscarGemini(query, '', true)
      ]);

      todos = todos.concat(resultadosNac[0], resultadosNac[2], resultadosNac[1]);
    }

    // Deduplicar
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

    console.log('Finalizado: ' + resultadosFinais.length + ' leads (cidade:' + daCidade + ', estado:' + doEstado + ', nacional:' + nacionais + ')');

    res.status(200).json({
      leads: resultadosFinais,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: resultadosFinais.length + ' leads para "' + query + '"' + (location ? ' em ' + location : '') + '. ' + comTelefone + ' com telefone. ' + daCidade + ' na cidade, ' + doEstado + ' no estado, ' + nacionais + ' nacionais.',
        targetAudience: 'Pessoas com intencao de compra',
        modo_busca: modoUsado,
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
