// ============================================================
// CÉREBRO B2C: Radar de Intenção de Compra
// Fontes: Google Custom Search + Mercado Livre + Gemini + Apify (OLX/ML)
// ============================================================

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX;
const MERCADO_LIVRE_TOKEN = process.env.MERCADO_LIVRE_TOKEN;
const MERCADO_LIVRE_SELLER_ID = process.env.MERCADO_LIVRE_SELLER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.REDIS_SENHA;

// 🎯 Controle de limites diários
const LIMITES = {
  google_cse: 100,
  gemini: 5000,
  apify_olx: 50,
  apify_ml: 50,
};

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// --- Controle de créditos (Upstash) ---
async function verificarLimite(fonte) {
  const hoje = new Date().toISOString().split('T')[0];
  const chave = `b2c:${fonte}:${hoje}`;
  const limite = LIMITES[fonte] || 100;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { permitido: true, usado: 0, restante: limite, limite };
  }

  try {
    const getRes = await fetch(`${UPSTASH_URL}/get/${chave}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const getData = await getRes.json();
    const usado = parseInt(getData.result || '0', 10);

    if (usado >= limite) {
      return { permitido: false, usado, restante: 0, limite };
    }

    return { permitido: true, usado, restante: limite - usado, limite };
  } catch {
    return { permitido: true, usado: 0, restante: limite, limite };
  }
}

async function incrementarLimite(fonte) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  const hoje = new Date().toISOString().split('T')[0];
  const chave = `b2c:${fonte}:${hoje}`;
  try {
    await fetch(`${UPSTASH_URL}/incr/${chave}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    await fetch(`${UPSTASH_URL}/expire/${chave}/172800`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
  } catch (err) {
    console.error('Erro ao incrementar:', err);
  }
}

// --- 1. Google Custom Search ---
async function buscarGoogleCSE(query, location) {
  const status = await verificarLimite('google_cse');
  if (!status.permitido || !GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];

  try {
    const termos = `"quero comprar" OR "onde compro" OR "procuro" "${query}"${location ? ` "${location}"` : ''}`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(termos)}&num=10&lr=lang_pt`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    await incrementarLimite('google_cse');

    return (data.items || []).map(item => ({
      name: item.title || 'Menção',
      source: 'Google Search',
      sourceUrl: item.link,
      intent: item.snippet || '',
      location: location || '',
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 70,
    }));
  } catch (err) {
    console.error('Erro Google CSE:', err);
    return [];
  }
}

// --- 2. Mercado Livre API (Leads de compradores) ---
async function buscarMercadoLivreLeads(query, location) {
  const status = await verificarLimite('mercado_livre');
  if (!status.permitido || !MERCADO_LIVRE_TOKEN || !MERCADO_LIVRE_SELLER_ID) return [];

  try {
    const url = `https://api.mercadolibre.com/vis/users/${MERCADO_LIVRE_SELLER_ID}/leads/buyers?limit=50&date_from=${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${MERCADO_LIVRE_TOKEN}` }
    });
    if (!response.ok) return [];
    const data = await response.json();
    await incrementarLimite('mercado_livre');

    return (data.results || [])
      .filter(lead => normalizar(lead.item_id || '').includes(normalizar(query)) || 
                      normalizar(lead.name || '').includes(normalizar(query)))
      .map(lead => ({
        name: lead.name || 'Comprador interessado',
        source: 'Mercado Livre (Lead)',
        sourceUrl: `https://www.mercadolivre.com.br/item/${lead.item_id}`,
        intent: `Interesse em ${lead.item_id}`,
        location: location || '',
        date: lead.date || new Date().toISOString().split('T')[0],
        contact: lead.email || lead.phone || null,
        score: 90,
      }));
  } catch (err) {
    console.error('Erro Mercado Livre:', err);
    return [];
  }
}

// --- 3. Gemini + Google Search Grounding ---
async function buscarGemini(query, location) {
  const status = await verificarLimite('gemini');
  if (!status.permitido || !GEMINI_API_KEY) return [];

  try {
    const prompt = `Você é um assistente de prospecção B2B/B2C. Busque na web menções públicas de pessoas ou empresas que estão PROCURANDO COMPRAR "${query}"${location ? ` em ${location}` : ''}. 
    
    Retorne um JSON com array de até 10 resultados, cada um com os campos:
    - name: nome da pessoa/empresa (se disponível)
    - source: site onde encontrou (OLX, Mercado Livre, Facebook, etc)
    - sourceUrl: URL da menção
    - intent: trecho da menção
    - location: cidade/estado (se disponível)
    - date: data aproximada
    - contact: telefone/email (se público)
    - score: 0-100 (quanto maior, mais forte a intenção)
    
    Foque em menções RECENTES e de ALTA INTENÇÃO (perguntando preço, querendo comprar, etc).
    Retorne APENAS o JSON, sem texto adicional.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
      })
    });

    if (!response.ok) return [];
    const data = await response.json();
    await incrementarLimite('gemini');

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const resultados = JSON.parse(jsonMatch[0]);
    return resultados.map(r => ({
      name: r.name || 'Menção encontrada',
      source: r.source || 'Google (via Gemini)',
      sourceUrl: r.sourceUrl || '',
      intent: r.intent || '',
      location: r.location || location || '',
      date: r.date || new Date().toISOString().split('T')[0],
      contact: r.contact || null,
      score: r.score || 60,
    }));
  } catch (err) {
    console.error('Erro Gemini:', err);
    return [];
  }
}

// --- 4. Apify OLX Brazil Scraper ---
async function buscarOLXApify(query, location) {
  const status = await verificarLimite('apify_olx');
  if (!status.permitido || !APIFY_API_TOKEN) return [];

  try {
    const input = {
      query: query,
      searchType: 'search',
      region: location ? 'brasil' : 'brasil',
      maxResults: 20,
      maxPages: 2,
      enrichDetails: false
    };

    const url = `https://api.apify.com/v2/actors/lentic_clockss~olx-br-scraper/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!response.ok) return [];
    const data = await response.json();
    await incrementarLimite('apify_olx');

    return (Array.isArray(data) ? data : []).map(item => ({
      name: item.sellerName || 'Anunciante OLX',
      source: 'OLX (Apify)',
      sourceUrl: item.url || '',
      intent: item.title || '',
      location: item.city ? `${item.city}, ${item.uf || ''}` : (location || ''),
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 65,
    }));
  } catch (err) {
    console.error('Erro Apify OLX:', err);
    return [];
  }
}

// --- 5. Apify Mercado Livre Scraper ---
async function buscarMercadoLivreApify(query, location) {
  const status = await verificarLimite('apify_ml');
  if (!status.permitido || !APIFY_API_TOKEN) return [];

  try {
    const input = {
      mode: 'search',
      country: 'BR',
      query: query,
      maxItems: 20,
      includeQuestions: true,
      includeReviews: false
    };

    const url = `https://api.apify.com/v2/actors/parsebird~mercadolibre-scraper-portugues/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!response.ok) return [];
    const data = await response.json();
    await incrementarLimite('apify_ml');

    return (Array.isArray(data) ? data : []).map(item => ({
      name: item.sellerName || 'Vendedor ML',
      source: 'Mercado Livre (Apify)',
      sourceUrl: item.url || '',
      intent: item.title || '',
      location: location || '',
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 60,
    }));
  } catch (err) {
    console.error('Erro Apify ML:', err);
    return [];
  }
}

// --- Handler Principal ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { query, location, count = 10 } = req.body;
  if (!query) return res.status(400).json({ error: 'Forneça o que deseja rastrear.' });

  try {
    console.log(`🔍 B2C Busca: "${query}"${location ? ` em ${location}` : ''}`);

    // Executar todas as fontes em paralelo
    const [google, ml, gemini, olx, mlApify] = await Promise.all([
      buscarGoogleCSE(query, location),
      buscarMercadoLivreLeads(query, location),
      buscarGemini(query, location),
      buscarOLXApify(query, location),
      buscarMercadoLivreApify(query, location),
    ]);

    // Combinar e deduplicar por sourceUrl
    const todos = [...ml, ...gemini, ...google, ...olx, ...mlApify];
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    // Ordenar por score (maior primeiro)
    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Limitar ao count
    const resultados = unicos.slice(0, count);

    // Estatísticas
    const fontes = {
      google: google.length,
      mercado_livre: ml.length,
      gemini: gemini.length,
      olx: olx.length,
      mercado_livre_apify: mlApify.length,
    };

    console.log(`✅ B2C finalizado: ${resultados.length} resultados`, fontes);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} menções encontradas para "${query}"${location ? ` em ${location}` : ''}. Fontes: ${Object.entries(fontes).filter(([k,v]) => v > 0).map(([k,v]) => `${k}(${v})`).join(', ')}`,
        targetAudience: 'Pessoas físicas com intenção de compra',
        fontes_utilizadas: fontes,
        total_antes_deduplicacao: todos.length,
      }
    });

  } catch (error) {
    console.error('Erro geral B2C:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
