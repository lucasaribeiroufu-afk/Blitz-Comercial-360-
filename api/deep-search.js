// ============================================================
// CÉREBRO v3: Google Places + Casa dos Dados v5 (completo)
// ============================================================

const CASA_DOS_DADOS_API_KEY = process.env.CASA_DOS_DADOS_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.CHAVE_API_DO_GOOGLE_MAPS;

// Mapeamento de termos → CNAE principal
const CNAE_MAP = {
  'posto': '4731800',
  'combustível': '4731800',
  'combustivel': '4731800',
  'supermercado': '4711302',
  'mercado': '4711302',
  'farmácia': '4771701',
  'farmacia': '4771701',
  'drogaria': '4771701',
  'restaurante': '5611201',
  'advogado': '6910601',
  'advocacia': '6910601',
  'clínica': '8630501',
  'clinica': '8630501',
  'oficina': '4520001',
  'mecânica': '4520001',
  'hotel': '5510801',
};

// ------------------------------------------------------------
// Normalização e similaridade de nomes
// ------------------------------------------------------------
function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similaridade(nome1, nome2) {
  const n1 = normalizar(nome1);
  const n2 = normalizar(nome2);
  const p1 = n1.split(' ').filter(p => p.length > 2);
  const p2 = n2.split(' ').filter(p => p.length > 2);
  if (p1.length === 0 || p2.length === 0) return 0;
  let matches = 0;
  for (const a of p1) {
    if (p2.some(b => a === b || a.includes(b) || b.includes(a))) matches++;
  }
  return matches / Math.max(p1.length, p2.length);
}

// ------------------------------------------------------------
// Buscar empresas na Casa dos Dados (v5 - retorna QSA completo)
// ------------------------------------------------------------
async function buscarEmpresasCasaDados(cnae, municipio, uf) {
  if (!CASA_DOS_DADOS_API_KEY) {
    console.error('CASA_DOS_DADOS_API_KEY não configurada');
    return [];
  }

  try {
    const body = {
      tipo_resultado: 'completo',
      situacao_cadastral: ['ATIVA'],
      limite: 100,
      pagina: 1,
    };

    if (cnae) body.codigo_atividade_principal = [cnae];
    if (uf) body.uf = [uf.toLowerCase()];
    if (municipio) body.municipio = [municipio.toLowerCase()];

    console.log('Casa dos Dados - Buscando:', JSON.stringify(body));

    const response = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa', {
      method: 'POST',
      headers: {
        'api-key': CASA_DOS_DADOS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Casa dos Dados erro HTTP:', response.status, errText);
      return [];
    }

    const data = await response.json();
    console.log('Casa dos Dados - Total retornado:', data?.total, '| Empresas:', data?.cnpjs?.length);
    return data?.cnpjs || [];
  } catch (err) {
    console.error('Erro Casa dos Dados:', err);
    return [];
  }
}

// ------------------------------------------------------------
// Enriquecer com telefone oficial via BrasilAPI
// ------------------------------------------------------------
async function buscarTelefoneBrasilAPI(cnpj) {
  try {
    const digits = String(cnpj).replace(/\D/g, '');
    if (digits.length !== 14) return null;

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.ddd_telefone_1) {
      const tel = String(data.ddd_telefone_1) + String(data.telefone_1 || '');
      return `(${tel.slice(0, 2)}) ${tel.slice(2)}`;
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { query, location, count = 10 } = req.body;
  if (!query) return res.status(400).json({ error: 'Forneça um termo de busca.' });
  if (!GOOGLE_MAPS_API_KEY) return res.status(500).json({ error: 'Google Maps API Key ausente.' });

  try {
    const searchQuery = location ? `${query} em ${location}` : query;

    // === 1) Google Places ===
    const googleResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri'
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'pt-BR',
        maxResultCount: Math.min(count, 20)
      })
    });

    if (!googleResponse.ok) {
      const err = await googleResponse.json();
      throw new Error(err.error?.message || 'Erro Google Places');
    }
    const googleData = await googleResponse.json();
    const places = googleData.places || [];

    // === 2) Extrair município e UF ===
    const locMatch = (location || '').match(/([^,]+?)[\s,-]*([A-Z]{2})\s*$/);
    let municipio = '';
    let uf = '';
    if (locMatch) {
      municipio = locMatch[1].trim();
      uf = locMatch[2].trim();
    } else {
      const end = places[0]?.formattedAddress || '';
      const m = end.match(/([^,]+)\s*-\s*([A-Z]{2})/);
      if (m) { municipio = m[1].trim(); uf = m[2].trim(); }
    }

    console.log('Município/UF extraídos:', municipio, uf);

    // === 3) Determinar CNAE ===
    const termoLower = query.toLowerCase();
    let cnae = null;
    for (const [key, val] of Object.entries(CNAE_MAP)) {
      if (termoLower.includes(key)) { cnae = val; break; }
    }

    console.log('CNAE identificado:', cnae);

    // === 4) Buscar empresas na Casa dos Dados ===
    let empresas = [];
    if (cnae && municipio && uf) {
      empresas = await buscarEmpresasCasaDados(cnae, municipio, uf);
    } else {
      console.warn('Faltam dados para consulta Casa dos Dados:', { cnae, municipio, uf });
    }

    // === 5) Combinar cada resultado do Google com a melhor empresa ===
    const leads = await Promise.all(places.map(async (place) => {
      const nomeGoogle = place.displayName?.text || '';

      let melhor = null;
      let melhorScore = 0;
      for (const emp of empresas) {
        const s = Math.max(
          similaridade(nomeGoogle, emp.razao_social || ''),
          similaridade(nomeGoogle, emp.nome_fantasia || '')
        );
        if (s > melhorScore) { melhorScore = s; melhor = emp; }
      }

      const usarCasaDados = melhor && melhorScore >= 0.25;

      const socios = usarCasaDados && Array.isArray(melhor.quadro_societario)
        ? melhor.quadro_societario.map(s => ({
            nome: s.nome,
            qualificacao: s.qualificacao_socio || 'Sócio'
          }))
        : [];

      let telefoneReceita = null;
      if (usarCasaDados && melhor.cnpj) {
        telefoneReceita = await buscarTelefoneBrasilAPI(melhor.cnpj);
      }

      const instaHandle = '@' + normalizar(nomeGoogle).replace(/\s+/g, '').slice(0, 20);

      return {
        name: nomeGoogle,
        phone: place.nationalPhoneNumber || telefoneReceita || 'Não disponível',
        location: place.formattedAddress || 'Endereço não disponível',
        profileUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        platform: 'google_maps',
        category: query,
        rating: place.rating || 0,
        reviewsCount: place.userRatingCount || 0,
        website: place.websiteUri || null,
        cnpj: usarCasaDados ? melhor.cnpj : null,
        razao_social: usarCasaDados ? melhor.razao_social : null,
        nome_fantasia: usarCasaDados ? melhor.nome_fantasia : null,
        socios: socios,
        telefone_receita: telefoneReceita,
        match_score: Math.round(melhorScore * 100),
        email: null,
        instagram: instaHandle,
        department: 'Setor de Compras / Gerência',
        decisionMaker: socios[0]?.nome
          ? `${socios[0].nome} (${socios[0].qualificacao})`
          : 'Proprietário / Gerente',
        trendingInsights: [`📍 Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: usarCasaDados ? Math.round(melhorScore * 100) : 60,
      };
    }));

    leads.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    res.status(200).json({
      leads,
      meta: {
        intent: 'google_places_enriched',
        summary: `${leads.length} resultados. ${leads.filter(l => l.cnpj).length} enriquecidos com CNPJ e sócios da Receita Federal.`,
        targetAudience: 'Empresas locais e decisores comerciais',
        trendingItems: [],
        suggestedPitch: `Abordar os decisores locais com ofertas relevantes para o setor de ${query}.`
      }
    });

  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
