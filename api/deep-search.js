// Função para consultar a BrasilAPI (fonte principal)
async function buscarCNPJ_BrasilAPI(cnpj) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (response.ok) {
      const data = await response.json();
      // Formata a resposta para o padrão que usaremos
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
    return null; // Se falhar, retorna nulo para tentar a próxima API
  } catch (error) {
    console.error('Erro na BrasilAPI:', error);
    return null;
  }
}

// Função para consultar a ReceitaWS (plano B)
async function buscarCNPJ_ReceitaWS(cnpj) {
  try {
    // A ReceitaWS usa um endpoint similar, mas sem a necessidade de token para o plano gratuito
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

export default async function handler(req, res) {
  // CORS
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

  if (!query) {
    return res.status(400).json({ error: 'Forneça um termo de busca.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API do Google Maps não configurada.' });
  }

  try {
    const searchQuery = location ? `${query} em ${location}` : query;

    // 1. Busca no Google Places (como já fazíamos)
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
      throw new Error(errorData.error?.message || 'Erro ao consultar Google Places');
    }

    const googleData = await googleResponse.json();
    const places = googleData.places || [];

    // 2. Para cada resultado, tentamos enriquecer com dados da Receita Federal
    const leadsEnriquecidos = await Promise.all(places.map(async (place) => {
      let dadosCNPJ = null;
      let cnpjEncontrado = null;

      // ** ESTRATÉGIA DE BUSCA DE CNPJ **
      // Como o Google não fornece o CNPJ, usamos uma "ponte" com a BrasilAPI.
      // A BrasilAPI possui um endpoint que busca empresas por CNAE e município.
      // Vamos usar o nome do local como termo de busca para tentar achar o CNPJ.
      try {
        // Extrai o município do endereço (ex: "Uberlândia - MG")
        const endereco = place.formattedAddress || '';
        const municipioMatch = endereco.match(/([^,]+)\s*-\s*[A-Z]{2}/);
        const municipio = municipioMatch ? municipioMatch[1].trim() : '';

        if (municipio) {
          // A BrasilAPI tem um endpoint de busca por CNAE e município (usando o código do IBGE).
          // Para simplificar, vamos usar um termo de busca genérico.
          // Em um cenário ideal, você precisaria do código IBGE do município.
          // Aqui, faremos uma busca textual simples para encontrar possíveis correspondências.
          const buscaNome = encodeURIComponent(place.displayName?.text || '');
          // Esta é uma simplificação. O ideal é usar o código IBGE.
          const responseBusca = await fetch(`https://brasilapi.com.br/api/cnpj/v1/search?query=${buscaNome}`);
          if (responseBusca.ok) {
            const resultadosBusca = await responseBusca.json();
            // Pega o primeiro resultado que parece ser o mais relevante
            if (resultadosBusca && resultadosBusca.length > 0) {
              cnpjEncontrado = resultadosBusca[0].cnpj;
            }
          }
        }
      } catch (e) {
        console.error('Erro na ponte para encontrar CNPJ:', e);
      }

      // 3. Se encontramos um possível CNPJ, buscamos os dados oficiais
      if (cnpjEncontrado) {
        // Tenta BrasilAPI primeiro
        dadosCNPJ = await buscarCNPJ_BrasilAPI(cnpjEncontrado);
        
        // Se falhar, tenta ReceitaWS
        if (!dadosCNPJ) {
          dadosCNPJ = await buscarCNPJ_ReceitaWS(cnpjEncontrado);
        }
      }

      // 4. Monta o objeto final combinando Google + Receita Federal
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
        trendingInsights: [`📍 Encontrado no Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: dadosCNPJ ? 100 : 85,
      };
    }));

    res.status(200).json({
      leads: leadsEnriquecidos,
      meta: {
        intent: 'google_places_search_enriched',
        summary: `Encontramos ${leadsEnriquecidos.length} resultados para "${searchQuery}". ${leadsEnriquecidos.filter(l => l.cnpj).length} foram enriquecidos com dados da Receita Federal.`,
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
