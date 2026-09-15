// ============================================================
// CÉREBRO B2C v6: Radar de Intenção de Compra (COMPRADORES)
// Com FALLBACK NACIONAL automático quando cidade tem poucos resultados
// ============================================================

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.REDIS_SENHA;

const LIMITES = {
  serper: 200,
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
  } catch (err) { console.error('Erro ao incrementar:', err); }
}

// --- 1. Serper.dev (Google Search) ---
async function buscarSerper(query, location) {
  const status = await verificarLimite('serper');
  if (!status.permitido) {
    console.log('🚫 Serper: limite diário atingido');
    return [];
  }
  if (!SERPER_API_KEY) {
    console.warn('⚠️ Serper: chave não configurada');
    return [];
  }

  try {
    // 🎯 Query com operadores focados em COMPRADORES + exclusões de VENDEDORES
    const baseQuery = `"quero comprar" OR "onde compro" OR "procuro" OR "estou procurando" OR "indicação de" "${query}"`;
    const excludeTerms = `-venda -vendendo -loja -preço -catálogo -fabricante -revendedor -distribuidor`;
    const q = location 
      ? `${baseQuery} ${location} ${excludeTerms}`
      : `${baseQuery} ${excludeTerms}`;
    
    console.log(`🔍 Serper query: "${q}"`);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        q, 
        gl: 'br', 
        hl: 'pt-br', 
        num: 20 
      })
    });

    if (!response.ok) {
      console.error('Serper erro:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    await incrementarLimite('serper');

    const organic = data.organic || [];
    console.log(`✅ Serper: ${organic.length} resultados brutos`);

    // Filtrar resultados que claramente são de vendedores
    const sellerKeywords = [
      'comprar agora', 'adicionar ao carrinho', 'frete grátis',
      'parcelamos', 'entrega em todo', 'compre online', 'loja virtual',
      'preço à vista', 'melhor preço', 'orçamento', 'tabela de preços',
      'catálogo completo', 'fabricamos', 'revenda autorizada'
    ];

    const filtered = organic.filter(item => {
      const text = normalizar((item.title || '') + ' ' + (item.snippet || ''));
      const isSeller = sellerKeywords.some(k => text.includes(normalizar(k)));
      return !isSeller;
    });

    console.log(`🎯 Serper: ${filtered.length} após filtro anti-vendedor`);

    return filtered.map(item => ({
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
    console.error('Erro Serper:', err);
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
    const prompt = `Você é um rastreador de intenção de compra. Busque na web menções públicas de PESSOAS FÍSICAS ou EMPRESAS que estão PROCURANDO COMPRAR "${query}"${location ? ` em ${location}` : ' no Brasil'}.

⚠️ REGRAS CRÍTICAS:
- Retorne APENAS menções de COMPRADORES (pessoas perguntando onde comprar, procurando indicação, querendo adquirir).
- NÃO retorne anúncios de VENDEDORES, lojas, fabricantes, catálogos, sites de e-commerce ou revendedores.
- NÃO retorne páginas de produtos à venda.
- Priorize: fóruns, grupos do Facebook, Reddit, Twitter/X, comentários no Instagram, perguntas no Google.

FORMATO (retorne APENAS o array JSON, sem markdown):
[{"name": "nome do autor ou 'Usuário'", "source": "site de origem", "sourceUrl": "URL completa", "intent": "trecho exato onde a pessoa demonstra intenção de compra", "location": "cidade/estado ou vazio", "date": "AAAA-MM-DD", "contact": null, "score": 85}]

Se não encontrar NENHUMA menção de comprador, retorne: []`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`🔍 Gemini query: "${query}"${location ? ` em ${location}` : ' (Brasil)'}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { 
          temperature: 0.2, 
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

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return [];

    let jsonText = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.log('⚠️ Gemini: não retornou array JSON');
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

    const sellerKeywords = [
      'comprar agora', 'carrinho', 'frete grátis', 'parcelamos',
      'compre online', 'loja virtual', 'melhor preço', 'orçamento',
      'catálogo', 'fabricamos', 'revenda', 'distribuidor'
    ];

    const leads = resultados
      .filter(r => r.sourceUrl && r.sourceUrl.startsWith('http'))
      .filter(r => {
        const text = normalizar((r.intent || '') + ' ' + (r.name || ''));
        return !sellerKeywords.some(k => text.includes(normalizar(k)));
      })
      .map(r => ({
        name: r.name || 'Menção encontrada',
        source: r.source || 'Google (via Gemini)',
        sourceUrl: r.sourceUrl || '',
        intent: r.intent || '',
        location: r.location || location || '',
        date: r.date || new Date().toISOString().split('T')[0],
        contact: r.contact || null,
        score: r.score || 70,
      }));

    console.log(`✅ Gemini: ${leads.length} menções válidas`);
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
    console.log(`\n🔍 ============ B2C: "${query}"${location ? ` em ${location}` : ' (Brasil)'} ============`);

    // 🎯 1ª tentativa: busca COM localização (se fornecida)
    let [serper, gemini] = await Promise.all([
      buscarSerper(query, location),
      buscarGemini(query, location),
    ]);

    const totalLocal = serper.length + gemini.length;
    console.log(`📊 Local: serper=${serper.length}, gemini=${gemini.length}, total=${totalLocal}`);

    // 🌎 FALLBACK NACIONAL: se retornar < 5 resultados e houver localização, expande para o Brasil
    if (location && totalLocal < 5) {
      console.log(`⚠️ Poucos resultados em "${location}". Expandindo para busca NACIONAL...`);
      
      const [serperNacional, geminiNacional] = await Promise.all([
        buscarSerper(query, ''),
        buscarGemini(query, ''),
      ]);

      // Marcar resultados nacionais com indicador
      serperNacional.forEach(r => { 
        r.location = r.location || `${location} (ou Brasil)`; 
        r.name = `🌎 ${r.name}`;
      });
      geminiNacional.forEach(r => { 
        r.location = r.location || `${location} (ou Brasil)`; 
        r.name = `🌎 ${r.name}`;
      });

      serper = [...serper, ...serperNacional];
      gemini = [...gemini, ...geminiNacional];
      
      console.log(`🌎 Nacional adicionado: serper=${serperNacional.length}, gemini=${geminiNacional.length}`);
    }

    console.log(`📊 Total final: serper=${serper.length}, gemini=${gemini.length}`);

    const todos = [...gemini, ...serper];
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));
    const resultados = unicos.slice(0, count);

    const fontes = { serper: serper.length, gemini: gemini.length };

    console.log(`✅ B2C finalizado: ${resultados.length} menções\n`);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} menções de compradores para "${query}"${location ? ` em ${location}` : ''}. Fontes: serper(${serper.length}), gemini(${gemini.length})`,
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
