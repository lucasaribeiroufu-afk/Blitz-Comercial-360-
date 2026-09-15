// ============================================================
// CÉREBRO B2C v7: Query simplificada + Filtro inteligente de vendedores
// Estratégia: Buscar amplo, filtrar depois
// ============================================================

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.REDIS_SENHA;

const LIMITES = { serper: 200, gemini: 500 };

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function verificarLimite(fonte) {
  const hoje = new Date().toISOString().split('T')[0];
  const chave = `b2c:${fonte}:${hoje}`;
  const limite = LIMITES[fonte] || 50;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return { permitido: true, usado: 0, restante: limite, limite };
  try {
    const getRes = await fetch(`${UPSTASH_URL}/get/${chave}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
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
    await fetch(`${UPSTASH_URL}/incr/${chave}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
    await fetch(`${UPSTASH_URL}/expire/${chave}/172800`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  } catch (err) { console.error('Erro incrementar:', err); }
}

// --- Serper: Query SIMPLES + filtro pós-busca ---
async function buscarSerper(query, location) {
  const status = await verificarLimite('serper');
  if (!status.permitido) return [];
  if (!SERPER_API_KEY) return [];

  try {
    // 🎯 Query SIMPLES: só o termo + localização (sem operadores complexos)
    const q = location ? `${query} ${location}` : query;
    
    console.log(`🔍 Serper query (simples): "${q}"`);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 20 })
    });

    if (!response.ok) {
      console.error('Serper erro:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    await incrementarLimite('serper');

    const organic = data.organic || [];
    console.log(`📥 Serper: ${organic.length} resultados brutos`);

    // 🎯 FILTRO INTELIGENTE pós-busca
    const sellerKeywords = [
      'comprar agora', 'adicionar ao carrinho', 'frete grátis',
      'parcelamos', 'compre online', 'loja virtual', 'melhor preço',
      'orçamento', 'catálogo', 'fabricamos', 'revenda', 'distribuidor',
      'preço à vista', 'tabela de preço', 'vendas', 'whatsapp para comprar'
    ];

    const buyerKeywords = [
      'quero comprar', 'quero adquirir', 'procuro', 'procurando',
      'onde compro', 'onde encontro', 'indicação', 'indica',
      'preciso comprar', 'preciso de', 'alguém sabe', 'alguém indica',
      'estou buscando', 'estou procurando', 'me indica', 'qual melhor'
    ];

    const filtered = organic
      .filter(item => {
        const text = normalizar((item.title || '') + ' ' + (item.snippet || ''));
        // Remove se tem keywords de vendedor (a menos que também tenha buyer)
        const isSeller = sellerKeywords.some(k => text.includes(normalizar(k)));
        const isBuyer = buyerKeywords.some(k => text.includes(normalizar(k)));
        return !isSeller || isBuyer; // mantém se for buyer mesmo com seller
      })
      .map(item => {
        const text = normalizar((item.title || '') + ' ' + (item.snippet || ''));
        const isBuyer = buyerKeywords.some(k => text.includes(normalizar(k)));
        return {
          name: item.title || 'Menção',
          source: item.displayLink || 'Google Search',
          sourceUrl: item.link || '',
          intent: item.snippet || '',
          location: location || '',
          date: new Date().toISOString().split('T')[0],
          contact: null,
          score: isBuyer ? 90 : 60, // Score alto para buyers
        };
      });

    console.log(`🎯 Serper após filtro: ${filtered.length} (buyers identificados: ${filtered.filter(f => f.score >= 90).length})`);
    return filtered;
  } catch (err) {
    console.error('Erro Serper:', err);
    return [];
  }
}

// --- Gemini: Prompt flexível ---
async function buscarGemini(query, location) {
  const status = await verificarLimite('gemini');
  if (!status.permitido) return [];
  if (!GEMINI_API_KEY) return [];

  try {
    const prompt = `Você é um rastreador de INTENÇÃO DE COMPRA. Busque na web brasileira pessoas mencionando interesse em adquirir "${query}"${location ? ` em ${location}` : ''}.

Procure por publicações onde alguém:
- Pergunta onde comprar
- Pede indicação de onde encontrar
- Diz que quer comprar / está procurando
- Pergunta sobre qual modelo é melhor para comprar
- Pede recomendações

IGNORE: sites de lojas, anúncios de vendedores, páginas de e-commerce com preços.

FORMATO (retorne APENAS array JSON, sem markdown):
[{"name": "nome ou 'Usuário'", "source": "site de origem", "sourceUrl": "URL completa", "intent": "trecho EXATO da publicação onde a pessoa demonstra a intenção", "location": "cidade ou vazio", "date": "AAAA-MM-DD", "contact": null, "score": 85}]

Se não achar nada, retorne: []`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`🔍 Gemini query: "${query}"${location ? ` em ${location}` : ''}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
      })
    });

    if (!response.ok) {
      console.error('Gemini erro:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    await incrementarLimite('gemini');

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
        score: r.score || 85,
      }));

    console.log(`✅ Gemini: ${leads.length} resultados`);
    return leads;
  } catch (err) {
    console.error('Erro Gemini:', err);
    return [];
  }
}

// --- Handler ---
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
    console.log(`\n🔍 B2C: "${query}"${location ? ` em ${location}` : ' (Brasil)'}`);

    // 1ª tentativa COM localização
    let [serper, gemini] = await Promise.all([
      buscarSerper(query, location),
      buscarGemini(query, location),
    ]);

    const totalLocal = serper.length + gemini.length;

    // 🌎 FALLBACK NACIONAL se < 5 resultados
    if (location && totalLocal < 5) {
      console.log(`⚠️ Poucos em "${location}". Buscando nacionalmente...`);
      const [sNac, gNac] = await Promise.all([
        buscarSerper(query, ''),
        buscarGemini(query, ''),
      ]);
      sNac.forEach(r => { r.name = `🌎 ${r.name}`; });
      gNac.forEach(r => { r.name = `🌎 ${r.name}`; });
      serper = [...serper, ...sNac];
      gemini = [...gemini, ...gNac];
    }

    const todos = [...gemini, ...serper];
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));
    const resultados = unicos.slice(0, count);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} menções de compradores para "${query}"${location ? ` em ${location}` : ''}.`,
        targetAudience: 'Pessoas físicas com intenção de compra',
        fontes_utilizadas: { serper: serper.length, gemini: gemini.length },
        total_antes_deduplicacao: todos.length,
      }
    });

  } catch (error) {
    console.error('Erro B2C:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
