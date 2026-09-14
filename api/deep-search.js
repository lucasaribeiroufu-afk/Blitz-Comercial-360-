export default async function handler(req, res) {
  // CORS - permite que o seu app acesse essa API
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
    return res.status(400).json({ error: 'Forneça um termo de busca (ex: "postos de combustível").' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API do Google Maps não configurada no servidor.' });
  }

  try {
    // Montar a busca textual para o Google Places
    const searchQuery = location ? `${query} em ${location}` : query;

    // Chamar a API do Google Places (New)
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
      console.error('Erro do Google Places:', errorData);
      throw new Error(errorData.error?.message || 'Erro ao consultar Google Places');
    }

    const data = await response.json();
    const places = data.places || [];

    // Mapear para o formato que o seu App espera
    const leads = places.map((place) => ({
      name: place.displayName?.text || 'Empresa sem nome',
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber || 'Telefone não disponível',
      location: place.formattedAddress || 'Endereço não disponível',
      profileUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      platform: 'google_maps',
      category: place.primaryTypeDisplayName?.text || query,
      rating: place.rating || 0,
      reviewsCount: place.userRatingCount || 0,
      email: null,
      instagram: null,
      department: 'Setor de Compras / Gerência',
      decisionMaker: 'Proprietário / Gerente',
      trendingInsights: [`Encontrado via Google Maps para: "${query}"${location ? ' em ' + location : ''}`],
      confidence: 100,
      cnpj: null,
      website: place.websiteUri || null
    }));

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
