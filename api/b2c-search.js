// ============================================================
// CÉREBRO B2C v2: Radar de Intenção de Compra
// Fontes: Google Custom Search + Gemini + Google Search Grounding
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

// --- Controle de limites (Upstash) ---
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
  if (!status.permitido) {
    console.log('🚫 Google CSE: limite diário atingido');
    return [];
  }
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
    console.warn('⚠️ Google CSE: chaves não configuradas');
    return [];
  }

  try {
    // Query simplificada (Custom Search tem limites de complexidade)
    const termos = `${query} comprar${location ? ' ' + location : ''}`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(termos)}&num=10&lr=lang_pt&gl=br`;

    console.log(`🔍 Google CSE: "${termos}"`);
    const response = await fetch(url);

    if (!response.ok) {
      const errData = await response.text();
      console.error('Google CSE erro:', response.status, errData);
      return [];
    }

    const data = await response.json();
    await incrementarLimite('google_cse');

    const resultados = (data.items || []).map(item => ({
      name: item.title || 'Menção',
      source: 'Google Search',
      sourceUrl: item.link || '',
      intent: item.snippet || '',
      location: location || '',
      date: new Date().toISOString().split('T')[0],
      contact: null,
      score: 75,
    }));

    console.log(`✅ Google CSE: ${resultados.length} resultados`);
    return resultados;
  } catch (err) {
    console.error('Erro Google CSE:', err);
    return [];
  }
}

// --- 2. Gemini + Google Search Grounding ---
async function buscarGemini(query, location) {
  const status = await verificarLimite('gemini');
  if (!status.permitido) {
    console.log('🚫 Gemini: limite diário atingido');
    return [];
  }
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ Gemini: chave não configurada');
    return [];
  }

  try {
    const prompt = `Busque na web menções públicas de pessoas ou empresas que estão PROCURANDO COMPRAR "${query}"${location ? ` em ${location}` : ''}.

Retorne APENAS um JSON válido (sem texto adicional, sem markdown), com array de até 10 resultados. Cada objeto deve ter:
{
  "name": "nome da pessoa ou empresa (ou 'Anúncio público')",
  "source": "site onde encontrou (OLX, Mercado Livre, Facebook, Instagram, etc)",
  "sourceUrl": "URL completa da menção",
  "intent": "trecho curto da menção (ex: 'quero comprar uma balança')",
  "location": "cidade/estado ou vazio",
  "date": "data aproximada AAAA-MM-DD ou vazio",
  "contact": "telefone ou email público ou null",
  "score": número de 0 a 100
}

Foque em menções RECENTES (últimos 30 dias) e de ALTA INTENÇÃO (perguntando preço, querendo comprar).

Se não encontrar nada, retorne: []`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`🔍 Gemini: buscando "${query}"`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],  // ✅ CORRIGIDO: era googleSearch, agora google_search
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('Gemini erro:', response.status, errData);
      return [];
    }

    const data = await response.json();
    await incrementarLimite('gemini');

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return [];

    // Tenta extrair JSON do texto
    let jsonText = text.trim();
    // Remove markdown se houver
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

    let resultados = [];
    try {
      const parsed = JSON.parse(jsonText);
      resultados = Array.isArray(parsed) ? parsed : (parsed.leads || []);
    } catch {
      // Tenta encontrar array no texto
      const match = jsonText.match(/\[[\s\S]*\]/);
      if (match) {
        try { resultados = JSON.parse(match[0]); } catch { return []; }
      }
    }

    const leads = resultados.map(r => ({
      name: r.name || 'Menção encontrada',
      source: r.source || 'Google (via Gemini)',
      sourceUrl: r.sourceUrl || '',
      intent: r.intent || '',
      location: r.location || location || '',
      date: r.date || new Date().toISOString().split('T')[0],
      contact: r.contact || null,
      score: r.score || 60,
    }));

    console.log(`✅ Gemini: ${leads.length} resultados`);
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
    console.log(`🔍 B2C Busca: "${query}"${location ? ` em ${location}` : ''}`);

    // Executar fontes em paralelo
    const [google, gemini] = await Promise.all([
      buscarGoogleCSE(query, location),
      buscarGemini(query, location),
    ]);

    // Combinar e deduplicar por sourceUrl
    const todos = [...gemini, ...google];
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    // Ordenar por score
    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));

    const resultados = unicos.slice(0, count);

    const fontes = {
      google: google.length,
      gemini: gemini.length,
    };

    console.log(`✅ B2C finalizado: ${resultados.length} resultados`, fontes);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} menções para "${query}"${location ? ` em ${location}` : ''}. Fontes: ${Object.entries(fontes).filter(([k,v]) => v > 0).map(([k,v]) => `${k}(${v})`).join(', ') || 'nenhuma'}`,
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
