// ============================================================
// CÉREBRO B2C v10: Radar de Intenção de Compra MULTI-NICHO
// Estratégia: Regional primeiro → Fallback Nacional automático
// Extrai: Nome do comprador + Telefone (do texto do post)
// Keywords: GERADOR INTELIGENTE (15-22 variações automáticas)
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ACTOR_ID = 'lofomachines~facebook-groups-posts-search-scraper';

// Palavras-chave universais que indicam intenção de compra
const KEYWORDS_COMPRA = [
  'quero comprar', 'onde compro', 'onde encontro', 'procuro',
  'procurando', 'preciso de', 'indicação', 'indica',
  'alguém indica', 'me indica', 'estou buscando', 'quero adquirir',
  'qual melhor', 'me ajudem a encontrar', 'estou procurando',
  'comprar', 'compro', 'a venda', 'venda'
];

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ============================================================
// 📞 EXTRAIR TELEFONE BRASILEIRO DE UM TEXTO
// ============================================================
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
          return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
        } else if (numero.length === 8) {
          return `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
        }
      }
    }
  }
  return null;
}

// ============================================================
// 🧠 GERADOR INTELIGENTE DE KEYWORDS (Multi-nicho)
// Transforma "Comprador de balança para pesagem de gado" em 15-22 variações
// ============================================================
function gerarKeywordsComprador(input) {
  // 1. Limpar prefixos de intenção do input
  const prefixos = [
    'comprador de', 'comprador', 'cliente que quer', 'cliente',
    'pessoa que quer', 'interessado em', 'quero comprar', 'quero',
    'preciso de', 'preciso', 'procuro por', 'procuro', 'busco',
    'vendedor de', 'vendedor'
  ];
  
  let produtoCore = input.toLowerCase().trim();
  for (const p of prefixos) {
    if (produtoCore.startsWith(p + ' ')) {
      produtoCore = produtoCore.replace(p + ' ', '').trim();
      break;
    }
  }

  // 2. Extrair palavras principais
  const palavras = produtoCore
    .split(/\s+/)
    .filter(w => w.length > 2 && !['para', 'com', 'dos', 'das', 'de', 'da', 'do', 'em'].includes(w));

  const versaoCurta = palavras.slice(0, 2).join(' ');
  const versaoMedia = palavras.slice(0, 3).join(' ');
  const versaoLonga = palavras.slice(0, 4).join(' ');

  // 3. Base de sinônimos + variações
  const produtos = new Set([versaoCurta, versaoMedia, versaoLonga, produtoCore]);
  
  // Variação sem acentos
  const semAcento = produtoCore.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  produtos.add(semAcento);

  // 4. Sinônimos por categoria
  const mapaCategorias = {
    'balanca': ['balanca', 'balança', 'balanca de pesagem', 'balanca eletronica', 'balanca digital'],
    'gado': ['gado', 'bovino', 'boi', 'rebanho', 'pecuaria', 'criacao de gado'],
    'pesagem': ['pesagem', 'pesar', 'peso', 'balanca de pesar'],
    'trator': ['trator', 'maquinario agricola', 'maquina agricola', 'implemento'],
    'vestido': ['vestido', 'vestidos', 'peca de roupa', 'roupa feminina'],
    'moda': ['moda', 'roupa', 'vestimenta', 'peca', 'look', 'conjunto'],
    'achadinhos': ['achadinhos', 'utilidades', 'casa', 'organizacao', 'cozinha'],
    'ventilador': ['ventilador', 'climatizador', 'ventilador de teto'],
    'iphone': ['iphone', 'celular apple', 'smartphone', 'celular'],
    'freezer': ['freezer', 'congelador', 'geladeira', 'refrigerador'],
    'celular': ['celular', 'smartphone', 'telefone movel'],
    'bicicleta': ['bicicleta', 'bike', 'bicicleta aro'],
    'carro': ['carro', 'veiculo', 'automovel', 'caminhonete'],
    'peca': ['peca', 'componente', 'acessorio'],
    'racao': ['racao', 'alimento animal', 'suplemento']
  };

  for (const [chave, alts] of Object.entries(mapaCategorias)) {
    if (produtoCore.includes(chave)) {
      for (const alt of alts) {
        // Substitui no produto core
        const variacao = produtoCore.replace(chave, alt);
        produtos.add(variacao);
        // Combina com versão curta
        if (palavras.length >= 2) {
          const variacaoCurta = palavras.slice(0, 2).map(w => 
            w === chave ? alt : w
          ).join(' ');
          produtos.add(variacaoCurta);
        }
      }
    }
  }

  // 5. Verbos de intenção de compra (universais)
  const verbos = [
    'quero comprar',
    'preciso comprar',
    'procuro',
    'estou procurando',
    'estou buscando',
    'onde compro',
    'onde encontro',
    'comprar',
    'compro',
    'busco',
    'indicação de',
    'quero adquirir'
  ];

  // 6. Combinar verbos + produtos (limitado para não explodir)
  const keywords = new Set();
  const produtosArray = Array.from(produtos).slice(0, 5); // máximo 5 produtos
  
  for (const verbo of verbos) {
    for (const produto of produtosArray) {
      const kw = `${verbo} ${produto}`.trim();
      if (kw.split(' ').length <= 6) {
        keywords.add(kw);
      }
    }
  }

  // 7. Variações "produto + ação"
  for (const produto of produtosArray.slice(0, 4)) {
    keywords.add(`${produto} comprar`);
    keywords.add(`${produto} a venda`);
    keywords.add(`${produto} indicação`);
  }

  // Retorna 18-22 keywords otimizadas
  return Array.from(keywords).slice(0, 8);
}

// ============================================================
// FONTE 1: APIFY - Facebook Groups (Regional → Nacional)
// ============================================================
async function buscarFacebookGroups(query, location, nacional = false) {
  if (!APIFY_API_TOKEN) {
    console.warn('⚠️ Apify: token não configurado');
    return [];
  }

  try {
    // 🧠 GERAR KEYWORDS INTELIGENTES a partir do input
    const keywords = gerarKeywordsComprador(query);
    const modoBusca = nacional ? 'NACIONAL' : (location || 'BRASIL');
    
    console.log(`🔍 Facebook Groups (${modoBusca}): "${query}"`);
    console.log(`📋 ${keywords.length} keywords: ${keywords.slice(0, 4).join(' | ')}...`);

    const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: keywords,
        country: 'br',
       maxPosts: 100,               // 100 por keyword = ~330 max total 
        afterDate: 'last_month'
      })
    });

    if (!response.ok) {
      console.error('Apify Facebook erro:', response.status);
      return [];
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : [];

    console.log(`📥 Facebook Groups: ${posts.length} posts brutos`);

    // Filtro: só posts com intenção de compra
    const keywordsNorm = KEYWORDS_COMPRA.map(normalizar);

    const filtrados = posts
      .filter(post => {
        const texto = normalizar(post.text || post.message || post.postText || '');
        return keywordsNorm.some(k => texto.includes(k));
      })
      .map(post => {
        const textoPost = post.text || post.message || post.postText || '';
        const textoNorm = normalizar(textoPost);
        
        const mencionaLocal = !nacional && location
          ? textoNorm.includes(normalizar(location.split(',')[0]))
          : false;

        const telefone = extrairTelefone(textoPost);

        return {
          name: post.author?.name || post.authorName || post.user?.name || 'Comprador',
          phone: telefone || '',
          source: 'Facebook Groups',
          sourceUrl: post.url || post.postUrl || post.link || '',
          intent: textoPost.substring(0, 400),
          location: mencionaLocal ? location : 'Brasil',
          date: post.createdAt 
            ? new Date(post.createdAt * 1000).toISOString().split('T')[0]
            : post.date || new Date().toISOString().split('T')[0],
          contact: telefone || null,
          score: mencionaLocal ? 98 : (nacional ? 90 : 95),
          tipo: 'buyer_intent',
          grupo: post.groupName || post.group || 'Grupo Facebook'
        };
      })
      .filter(p => p.sourceUrl && p.sourceUrl.startsWith('http'));

    // Se regional, prioriza os da cidade
    if (!nacional && location) {
      const regionais = filtrados.filter(p => p.score === 98);
      console.log(`✅ Facebook Groups: ${regionais.length} regionais / ${filtrados.length} total`);
      return regionais.length > 0 ? regionais : filtrados;
    }

    console.log(`✅ Facebook Groups: ${filtrados.length} posts com intenção`);
    return filtrados;

  } catch (err) {
    console.error('Erro Apify Facebook Groups:', err);
    return [];
  }
}

// ============================================================
// FONTE 2: SERPER.DEV (Regional → Nacional)
// ============================================================
async function buscarSerper(query, location, nacional = false) {
  if (!SERPER_API_KEY) return [];

  try {
    const q = (!nacional && location)
      ? `"quero comprar" OR "onde compro" "${query}" ${location}`
      : `"quero comprar" OR "onde compro" "${query}"`;

    const modoBusca = nacional ? 'NACIONAL' : (location || 'BRASIL');
    console.log(`🔍 Serper (${modoBusca}): "${q}"`);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 15 })
    });

    if (!response.ok) return [];
    const data = await response.json();
    const organic = data.organic || [];

    console.log(`✅ Serper: ${organic.length} resultados`);

    return organic.map(item => {
      const snippet = item.snippet || '';
      const telefone = extrairTelefone(snippet);
      
      return {
        name: item.title || 'Menção',
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
    console.error('Erro Serper:', err);
    return [];
  }
}

// ============================================================
// FONTE 3: GEMINI (Regional → Nacional)
// ============================================================
async function buscarGemini(query, location, nacional = false) {
  if (!GEMINI_API_KEY) return [];

  try {
    const localTexto = (!nacional && location) ? ` em ${location}` : ' no Brasil';
    
    const prompt = `Você é um rastreador de INTENÇÃO DE COMPRA. Busque na web menções públicas de pessoas procurando comprar "${query}"${localTexto}.

REGRAS:
- Retorne APENAS compradores (quem quer comprar, procura, pergunta onde encontrar)
- NÃO retorne lojas, e-commerce, catálogos, fabricantes
- Priorize: Facebook, fóruns, Reddit, Instagram, Twitter/X

FORMATO (retorne APENAS array JSON, sem markdown):
[{"name": "nome ou 'Comprador'", "source": "site", "sourceUrl": "URL completa", "intent": "trecho exato da menção", "location": "cidade/estado", "phone": "telefone se visível no texto", "date": "AAAA-MM-DD", "score": 80}]

Se não achar nada, retorne: []`;

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
      .map(r => {
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

    console.log(`✅ Gemini: ${leads.length} menções`);
    return leads;
  } catch (err) {
    console.error('Erro Gemini:', err);
    return [];
  }
}

// ============================================================
// HANDLER PRINCIPAL (Regional → Fallback Nacional)
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
    console.log(`\n🎯 ============ B2C: "${query}"${location ? ` em ${location}` : ''} ============`);

    // 🎯 FASE 1: Busca REGIONAL (se localização fornecida)
    let todos = [];
    let modoUsado = 'nacional';

    if (location && location.trim()) {
      console.log(`📍 FASE 1: Busca regional em "${location}"`);
      
      const [fbRegional, serperRegional, geminiRegional] = await Promise.all([
        buscarFacebookGroups(query, location, false),
        buscarSerper(query, location, false),
        buscarGemini(query, location, false)
      ]);

      todos = [...fbRegional, ...geminiRegional, ...serperRegional];
      modoUsado = 'regional';

      console.log(`📊 Regional: ${todos.length} leads encontrados`);
    }

    // 🌎 FASE 2: FALLBACK NACIONAL (se < 5 resultados ou sem localização)
    if (todos.length < 5) {
      console.log(`⚠️ Poucos resultados regionais (${todos.length}). Buscando NACIONALMENTE...`);

      const [fbNacional, serperNacional, geminiNacional] = await Promise.all([
        buscarFacebookGroups(query, '', true),
        buscarSerper(query, '', true),
        buscarGemini(query, '', true)
      ]);

      const todosNacional = [...fbNacional, ...geminiNacional, ...serperNacional];
      console.log(`📊 Nacional: ${todosNacional.length} leads encontrados`);

      if (todos.length > 0) {
        todos = [...todos, ...todosNacional];
        modoUsado = 'regional + nacional';
      } else {
        todos = todosNacional;
        modoUsado = 'nacional';
      }
    }

    // Deduplicar por URL
    const vistos = new Set();
    const unicos = todos.filter(item => {
      if (!item.sourceUrl || vistos.has(item.sourceUrl)) return false;
      vistos.add(item.sourceUrl);
      return true;
    });

    // Ordenar por score
    unicos.sort((a, b) => (b.score || 0) - (a.score || 0));

    const resultados = unicos.slice(0, count);
    const comTelefone = resultados.filter(r => r.phone).length;

    const fontes = {
      facebook_groups: resultados.filter(r => r.source === 'Facebook Groups').length,
      serper: resultados.filter(r => r.source.includes('Google')).length,
      gemini: resultados.filter(r => r.source === 'Gemini').length,
      com_telefone: comTelefone
    };

    console.log(`✅ Finalizado: ${resultados.length} leads (${comTelefone} com telefone) - modo: ${modoUsado}\n`);

    res.status(200).json({
      leads: resultados,
      meta: {
        intent: 'b2c_buyer_intent',
        summary: `${resultados.length} leads de compradores para "${query}"${location ? ` em ${location}` : ''} (modo: ${modoUsado}). ${comTelefone} com telefone disponível.`,
        targetAudience: 'Pessoas com intenção de compra',
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
