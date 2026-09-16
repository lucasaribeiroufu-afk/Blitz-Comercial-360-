// ============================================================
// CÉREBRO B2C v8: Radar de Intenção de Compra MULTI-NICHO
// Funciona para QUALQUER produto/serviço/nicho:
// 🐄 Agro | 👗 Moda | 🏠 Casa | 📱 Eletrônicos | 🎁 Presentes | etc.
// Fontes: Apify Facebook Groups + Serper.dev + Gemini
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Actor ID do lofomachines (busca por keyword em TODOS os grupos públicos)
const ACTOR_ID = 'lofomachines~facebook-groups-posts-search-scraper';

// 🎯 Palavras-chave UNIVERSAIS de intenção de compra
// Funcionam para qualquer nicho: agro, moda, casa, eletrônicos, etc.
const KEYWORDS_COMPRA = [
  'quero comprar',
  'onde compro',
  'onde encontro',
  'procuro',
  'procurando',
  'preciso de',
  'indicação',
  'indica',
  'alguém indica',
  'me indica',
  'estou buscando',
  'quero adquirir',
  'qual melhor',
  'me ajudem a encontrar',
  'estou procurando'
];

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups Posts Search (Multi-nicho)
// ============================================================
async function buscarFacebookGroups(query, location) {
  if (!APIFY_API_TOKEN) {
    console.warn('⚠️ Apify: token não configurado');
    return [];
  }

  try {
    // 🎯 Keywords dinâmicas: variações de intenção + o produto/nicho
    const keywords = [
      `quero comprar ${query}`,
      `onde compro ${query}`,
      `procuro ${query}`,
      `indicação ${query}`,
      `onde encontro ${query}`,
      // Variações com localização se fornecida
      ...(location ? [
        `quero comprar ${query} ${location}`,
        `onde compro ${query} ${location}`
      ] : [])
    ];

    console.log(`🔍 Facebook Groups: "${query}"${location ? ` em ${location}` : ''}`);
    console.log(`📋 Keywords: ${keywords.length} variações`);

    const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: keywords,
        countryCode: 'br',        // Brasil
        maxPosts: 100,            // 100 posts por keyword (~$0,30 por busca)
        afterDate: 'last_month'   // Últimos 30 dias
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Apify Facebook erro:', response.status, errText);
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];

    console.log(`📥 Facebook Groups: ${posts.length} posts brutos`);

    // 🎯 Filtro local: rejeitar posts sem keyword de compra
    const keywordsNorm = KEYWORDS_COMPRA.map(normalizar);

    const filtrados = posts
      .filter(post => {
        const texto = normalizar(post.text || post.message || post.postText || '');
        return keywordsNorm.some(k => texto.includes(k));
      })
      .map(post => ({
        name: post.author?.name || post.authorName || post.user?.name || 'Usuário do Grupo',
        source: 'Facebook Groups',
        sourceUrl: post.url || post.postUrl || post.link || '',
        intent: (post.text || post.message || post.postText || '').substring(0, 300),
        location: location || 'Brasil',
        date: post.createdAt 
          ? new Date(post.createdAt * 1000).toISOString().split('T')[0]
          : post.date || new Date().toISOString().split('T')[0],
        contact: null,
        score: 95, // 🔥 Alta prioridade - intenção explícita em grupo
        tipo: 'buyer_intent',
        grupo: post.groupName || post.group || 'Grupo Facebook'
      }))
      .filter(p => p.sourceUrl && p.sourceUrl.startsWith('http'));

    console.log(`✅ Facebook Groups: ${filtrados.length} posts com intenção de compra`);
    return filtrados;

  } catch (err) {
    console.error('Erro Apify Facebook Groups:', err);
    return [];
  }
}

// ============================================================
// FONTE 2: SERPER.DEV (Google Search - Fallback)
// ============================================================
async function buscarSerper(query, location) {
  if (!SERPER_API_KEY) return [];

  try {
    const q = location 
      ? `"quero comprar" OR "onde compro" OR "indicação" "${query}" ${location}`
      : `"quero comprar" OR "onde compro" OR "indicação" "${query}"`;

    console.log(`🔍 Serper: "${q}"`);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 15 })
    });

    if (!response.ok) return [];
    const data = await response.json();
    const organic = data.organic || [];

    console.log(`✅ Serper: ${organic.length} resultados`);

    return organic.map(item => ({
      name: item.title || 'Menção',
      source: item.displayLink || 'Google Search',
      sourceUrl: item.link || '',
      intent: item.snippet || '',
      location: location || '',
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 70,
      tipo: 'search_result',
      grupo: 'Google'
    }));
  } catch (err) {
    console.error('Erro Serper:', err);
    return [];
  }
}

// ============================================================
// FONTE 3: GEMINI + Google Search Grounding (Multi-nicho)
// ============================================================
async function buscarGemini(query, location) {
  if (!GEMINI_API_KEY) return [];

  try {
    const prompt = `Você é um rastreador de INTENÇÃO DE COMPRA. Busque na web brasileira menções públicas de pessoas que estão PROCURANDO COMPRAR "${query}"${location ? ` em ${location}` : ''}.

REGRAS:
- Retorne APENAS menções de COMPRADORES (quem quer comprar, procura, pergunta onde encontrar).
- NÃO retorne lojas, e-commerce, catálogos, fabricantes.
- Priorize: grupos públicos do Facebook, fóruns, Reddit, Instagram, Twitter/X.

FORMATO (retorne APENAS array JSON, sem markdown):
[{"name": "nome ou 'Usuário'", "source": "site", "sourceUrl": "URL completa", "intent": "trecho exato da menção", "location": "cidade/estado", "date": "AAAA-MM-DD", "contact": null, "score": 80}]

Se não achar nada, retorne: []`;

    console.log(`🔍 Gemini: "${query}"`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return [];

    let jsonText = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];

    let resultados = [];
    try { resultados = JSON.parse(arrayMatch[0]); } catch { return []; }
    if (!Array.isArray(resultados)) return [];

    const leads = resultados
      .filter(r => r.sourceUrl && r.sourceUrl.startsWith('http'))
      .map(r => ({
        name: r.name || 'Menção',
        source: r.source || 'Gemini',
        sourceUrl: r.sourceUrl || '',
        intent: r.intent || '',
        location: r.location || location || '',
        date: r.date || new Date().toISOString().split('T')[0],
        contact: r.contact || null,
        score: r.score || 80,
        tipo: 'buyer_intent',
        grupo: 'Gemini'
      }));

    console.log(`✅ Gemini: ${leads.length} menções`);
    return leads;
  } catch (err) {
    console.error('Erro Gemini:', err);
    return [];
  }
}

// ============================================================
// HANDLER PRINCIPAL (Multi-nicho)
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { query, location, count = 20 } = req.body;
  if (!query) return res.status(400).json({ error: 'Forneça o que deseja rastrear.' });

  try {
    console.log(`\n🎯 ============ B2C Multi-Nicho: "${query}"${location ? ` em ${location}` : ''} ============`);

    // Executar todas as fontes em paralelo
    const [facebookPosts, serperResults, geminiResults] = await Promise.all([
      buscarFacebookGroups(query, location),
      buscarSerper(query, location),
      buscarGemini(query, location)
    ]);

    console.log(`📊 Fontes: FB=${facebookPosts.length}, Serper=${serperResults.length}, Gemini=${geminiResults.length}`);

    // Combinar: Facebook (alta prioridade) + Gemini + Serper
    const todos = [...facebookPosts, ...geminiResults, ...serperResults];

    // Deduplicar por URL
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    // Ordenar por score (Facebook primeiro com 95)
    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));

    const resultados = unicos.slice(0, count);

    const fontes = {
      facebook_groups: facebookPosts.length,
      serper: serperResults.length,
      gemini: geminiResults.length
    };

    console.log(`✅ B2C finalizado: ${resultados.length} leads únicos\n`);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} leads de compradores para "${query}"${location ? ` em ${location}` : ''}. Fontes: Facebook(${fontes.facebook_groups}), Gemini(${fontes.gemini}), Serper(${fontes.serper})`,
        targetAudience: 'Pessoas com intenção de compra',
        fontes_utilizadas: fontes,
        total_antes_deduplicacao: todos.length
      }
    });

  } catch (error) {
    console.error('Erro geral B2C Multi-nicho:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
