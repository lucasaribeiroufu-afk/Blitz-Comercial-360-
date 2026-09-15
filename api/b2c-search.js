// ============================================================
// CÉREBRO B2C v3: Radar de Intenção de Compra
// Fix: remoção de responseMimeType + parse robusto de resposta
// ============================================================

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.REDIS_SENHA;

const LIMITES = {
  google_cse: 90,
  gemini: 500,
};

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function verificarLimite(fonte) {
  const hoje = new Date().toISOString().split('T')[0];
  const chave = `b2c:${fonte}:${hoje}`;
  const limite = LIMITES[fonte] || 50;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { permitido: true, usado: 0, restante: limite, limite };
  }

  try {
    const getRes = await fetch(`${UPSTASH_URL}/get/${chave}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const getData = await getRes.json();
    const usado = parseInt(getData.result || '0', 10);

    if (usado >= limite) return { permitido: false, usado, restante: 0, limite };
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
  } catch (err) { console.error('Erro ao incrementar:', err); }
}

// --- 1. Google Custom Search ---
async function buscarGoogleCSE(query, location) {
  const status = await verificarLimite('google_cse');
  if (!status.permitido) return [];
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];

  try {
    // Query SIMPLES (Custom Search rejeita queries muito complexas)
    const termos = location ? `${query} ${location}` : query;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(termos)}&num=10&lr=lang_pt&gl=br`;

    console.log(`🔍 Google CSE query: "${termos}"`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Google CSE erro:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    await incrementarLimite('google_cse');

    console.log(`📥 Google CSE raw:`, {
      searchInfo: data.searchInformation,
      itemsCount: data.items?.length || 0
    });

    return (data.items || []).map(item => ({
      name: item.title || 'Menção',
      source: item.displayLink || 'Google Search',
      sourceUrl: item.link || '',
      intent: item.snippet || '',
      location: location || '',
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 75,
    }));
  } catch (err) {
    console.error('Erro Google CSE:', err);
    return [];
  }
}

// --- 2. Gemini + Google Search Grounding (SEM responseMimeType) ---
async function buscarGemini(query, location) {
  const status = await verificarLimite('gemini');
  if (!status.permitido) return [];
  if (!GEMINI_API_KEY) return [];

  try {
    const prompt = `Liste menções públicas na web de pessoas ou empresas procurando comprar "${query}"${location ? ` em ${location}` : ''}.

Retorne APENAS um array JSON (sem markdown, sem explicação) com até 10 itens:
[{"name": "nome ou 'Anúncio'", "source": "site", "sourceUrl": "URL", "intent": "trecho", "location": "cidade", "date": "AAAA-MM-DD", "contact": null, "score": 75}]

Se não encontrar nada, retorne: []`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`🔍 Gemini query: "${query}"`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],  // ✅ SEM responseMimeType
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      })
    });

    if (!response.ok) {
      console.error('Gemini erro:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    await incrementarLimite('gemini');

    // Logs detalhados para debug
    console.log(`📥 Gemini raw response:`, JSON.stringify(data).slice(0, 500));

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';
    console.log(`📝 Gemini text length: ${text.length}`);

    if (!text) return [];

    // Parse robusto: remove markdown, encontra array
    let jsonText = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Tenta encontrar o array no texto
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.log(`⚠️ Gemini não retornou array JSON`);
      return [];
    }

    let resultados = [];
    try {
      resultados = JSON.parse(arrayMatch[0]);
    } catch (parseErr) {
      console.error('Erro parse JSON Gemini:', parseErr);
      return [];
    }

    if (!Array.isArray(resultados)) return [];

    const leads = resultados.map(r => ({
      name: r.name || 'Menção encontrada',
      source: r.source || 'Google (via Gemini)',
      sourceUrl: r.sourceUrl || '',
      intent: r.intent || '',
      location: r.location || location || '',
      date: r.date || new Date().toISOString().split('T')[0],
      contact: r.contact || null,
      score: r.score || 60,
    })).filter(l => l.sourceUrl && l.sourceUrl.startsWith('http'));

    console.log(`✅ Gemini: ${leads.length} leads válidos`);
    return leads;
  } catch (err) {
    console.error('Erro Gemini:', err);
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

  const { query, location, count = 15 } = req.body;
  if (!query) return res.status(400).json({ error: 'Forneça o que deseja rastrear.' });

  try {
    console.log(`\n🔍 ============ B2C Busca: "${query}"${location ? ` em ${location}` : ''} ============`);

    // Executar em paralelo
    const [google, gemini] = await Promise.all([
      buscarGoogleCSE(query, location),
      buscarGemini(query, location),
    ]);

    console.log(`📊 Resultado das fontes: google=${google.length}, gemini=${gemini.length}`);

    const todos = [...gemini, ...google];
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));
    const resultados = unicos.slice(0, count);

    const fontes = { google: google.length, gemini: gemini.length };

    console.log(`✅ B2C finalizado: ${resultados.length} leads únicos\n`);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} menções para "${query}"${location ? ` em ${location}` : ''}. Fontes: google(${google.length}), gemini(${gemini.length})`,
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
