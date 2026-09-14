// Função para gerar Instagram limpo (sem espaços nem caracteres especiais)
function gerarInstagram(nome) {
  if (!nome) return null;
  const clean = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '')        // remove TUDO que não é letra/número
    .slice(0, 20);                    // limita a 20 caracteres
  return clean ? `@${clean}` : null;
}

// Função para limpar o nome do estabelecimento (remover prefixos comuns)
function limparNome(nome) {
  if (!nome) return 'Empresa';
  return nome
    .replace(/^(Auto\s+)?Posto\s+/i, '')
    .replace(/\s*-\s*(GRUPO|Grupo|REDE|Rede)\s+.*$/i, '')
    .trim();
}

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

  if (!query) {
    return res.status(400).json({ error: 'Forneça um termo de busca.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API do Google Maps não configurada.' });
  }

  try {
    const searchQuery = location ? `${query} em ${location}` : query;

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.primaryTypeDisplayName'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'pt-BR',
        maxResultCount: Math.min(count, 20)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erro ao consultar Google Places');
    }

    const data = await response.json();
    const places = data.places || [];

    // Mapear cada lugar para o formato do card
    const leads = places.map((place) => {
      const nomeOriginal = place.displayName?.text || 'Empresa sem nome';
      const nomeLimpo = limparNome(nomeOriginal);
      const instagram = gerarInstagram(nomeLimpo);

      // Extrair telefone com formatação bonita
      const telefone = place.nationalPhoneNumber || place.internationalPhoneNumber || 'Não disponível';

      return {
        name: nomeOriginal,
        company: nomeLimpo,
        phone: telefone,
        establishmentPhone: telefone,
        location: place.formattedAddress || 'Endereço não disponível',
        profileUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        platform: 'google_maps',
        category: place.primaryTypeDisplayName?.text || query,
        rating: place.rating || 0,
        reviewsCount: place.userRatingCount || 0,
        instagram: instagram,
        email: null,
        website: place.websiteUri || null,
        department: 'Setor de Compras / Gerência',
        decisionMaker: 'Proprietário / Gerente',
        trendingInsights: [`📍 Encontrado no Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: 100,
        cnpj: null,
        socios: []
      };
    });

    res.status(200).json({
      leads: leads,
      meta: {
        intent: 'google_places_search',
        summary: `Encontramos ${leads.length} resultados para "${searchQuery}" no Google Maps.`,
        targetAudience: 'Empresas locais e decisores comerciais',
        trendingItems: [],
        suggestedPitch: `Abordar os decisores locais com ofertas relevantes para o setor de ${query}.`
      }
    });

  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados no Google Places' });
  }
}
