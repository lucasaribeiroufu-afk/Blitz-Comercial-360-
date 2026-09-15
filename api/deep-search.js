// ============================================================
// CÉREBRO COMPLETO: Google Places + Casa dos Dados + BrasilAPI + ReceitaWS
// ============================================================

// Mapeamento simples de termos para CNAE (para busca na Casa dos Dados)
const CNAE_MAP = {
  'posto de combustível': '4731800',
  'posto': '4731800',
  'supermercado': '4711302',
  'farmácia': '4771701',
  'drogaria': '4771701',
  'restaurante': '5611201',
  'advogado': '6910601',
  'clínica': '8630501',
  'oficina': '4520001',
};

// ------------------------------------------------------------
// 1. Função para consultar a BrasilAPI (fonte principal)
// ------------------------------------------------------------
async function buscarCNPJ_BrasilAPI(cnpj) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (response.ok) {
      const data = await response.json();
      return {
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia,
        telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1}) ${data.telefone_1}` : null,
        socios: data.qsa ? data.qsa.map(s => ({
          nome: s.nome_socio,
          qualificacao: s.qualificacao_socio
        })) : []
      };
    }
    return null;
  } catch (error) {
    console.error('Erro na BrasilAPI:', error);
    return null;
  }
}

// ------------------------------------------------------------
// 2. Função para consultar a ReceitaWS (plano B)
// ------------------------------------------------------------
async function buscarCNPJ_ReceitaWS(cnpj) {
  try {
    const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'ERROR') return null;
      
      return {
        cnpj: data.cnpj,
        razao_social: data.nome,
        nome_fantasia: data.fantasia,
        telefone: data.telefone,
        socios: data.qsa ? data.qsa.map(s => ({
          nome: s.nome,
          qualificacao: s.qual
        })) : []
      };
    }
    return null;
  } catch (error) {
    console.error('Erro na ReceitaWS:', error);
    return null;
  }
}

// ------------------------------------------------------------
// 3. Função para buscar CNPJs na Casa dos Dados (API pública)
// ------------------------------------------------------------
async function buscarCNPJs_CasaDados(cnae, municipio, uf) {
  try {
    const response = await fetch('https://api.casadosdados.com.br/v5/public/cnpj/pesquisa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_atividade_principal: [cnae],
        situacao_cadastral: ['ATIVA'],
        uf: [uf],
        municipio: [municipio.toUpperCase()],
        limite: 20,
        pagina: 1
      })
    });

    if (response.ok) {
      const data = await response.json();
      // A resposta traz uma lista de empresas com CNPJ
      return data.data ? data.data.map(item => item.cnpj) : [];
    }
    return [];
  } catch (error) {
    console.error('Erro na Casa dos Dados:', error);
    return [];
  }
}

// ------------------------------------------------------------
// 4. Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { query, location, count = 10 } = req.body;
  if (!query) return res.status(400).json({ error: 'Forneça um termo de busca.' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Chave do Google Maps não configurada.' });

  try {
    const searchQuery = location ? `${query} em ${location}` : query;

    // 1. Buscar no Google Places
    const googleResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'pt-BR',
        maxResultCount: Math.min(count, 20)
      })
    });

    if (!googleResponse.ok) {
      const errorData = await googleResponse.json();
      throw new Error(errorData.error?.message || 'Erro no Google Places');
    }

    const googleData = await googleResponse.json();
    const places = googleData.places || [];

    // 2. Para cada lugar, tentar enriquecer com dados da Receita Federal
    const leadsEnriquecidos = await Promise.all(places.map(async (place) => {
      let dadosCNPJ = null;
      let cnpjEncontrado = null;

      try {
        // Extrair município e UF do endereço do Google
        const endereco = place.formattedAddress || '';
        const matchMunicipio = endereco.match(/([^,]+)\s*-\s*([A-Z]{2})/);
        const municipio = matchMunicipio ? matchMunicipio[1].trim() : '';
        const uf = matchMunicipio ? matchMunicipio[2].trim() : '';

        // Descobrir o CNAE a partir do termo de busca (query)
        const termoLower = query.toLowerCase();
        let cnae = null;
        for (const [key, value] of Object.entries(CNAE_MAP)) {
          if (termoLower.includes(key)) {
            cnae = value;
            break;
          }
        }

        // Se temos CNAE e município, buscar CNPJs na Casa dos Dados
        if (cnae && municipio && uf) {
          const cnpjs = await buscarCNPJs_CasaDados(cnae, municipio, uf);
          if (cnpjs.length > 0) {
            // Pega o primeiro CNPJ (ou poderíamos tentar achar o mais similar pelo nome)
            cnpjEncontrado = cnpjs[0];
          }
        }
      } catch (e) {
        console.error('Erro na ponte para CNPJ:', e);
      }

      // 3. Se encontramos um CNPJ, buscar dados oficiais
      if (cnpjEncontrado) {
        dadosCNPJ = await buscarCNPJ_BrasilAPI(cnpjEncontrado);
        if (!dadosCNPJ) {
          dadosCNPJ = await buscarCNPJ_ReceitaWS(cnpjEncontrado);
        }
      }

      // 4. Montar o objeto final
      return {
        name: place.displayName?.text || 'Empresa sem nome',
        phone: place.nationalPhoneNumber || place.internationalPhoneNumber || 'Não disponível',
        location: place.formattedAddress || 'Endereço não disponível',
        profileUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        platform: 'google_maps',
        category: query,
        rating: place.rating || 0,
        reviewsCount: place.userRatingCount || 0,
        website: place.websiteUri || null,
        // Dados da Receita Federal (se encontrados)
        cnpj: dadosCNPJ?.cnpj || null,
        razao_social: dadosCNPJ?.razao_social || null,
        socios: dadosCNPJ?.socios || [],
        telefone_receita: dadosCNPJ?.telefone || null,
        // Campos padrão
        email: null,
        instagram: null,
        department: 'Setor de Compras / Gerência',
        decisionMaker: dadosCNPJ?.socios?.[0]?.nome || 'Proprietário / Gerente',
        trendingInsights: [`📍 Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: dadosCNPJ ? 100 : 85,
      };
    }));

    res.status(200).json({
      leads: leadsEnriquecidos,
      meta: {
        intent: 'google_places_search_enriched',
        summary: `Encontramos ${leadsEnriquecidos.length} resultados. ${leadsEnriquecidos.filter(l => l.cnpj).length} foram enriquecidos com dados da Receita Federal.`,
        targetAudience: 'Empresas locais e decisores comerciais',
        trendingItems: [],
        suggestedPitch: `Abordar os decisores locais com ofertas relevantes para o setor de ${query}.`
      }
    });

  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
