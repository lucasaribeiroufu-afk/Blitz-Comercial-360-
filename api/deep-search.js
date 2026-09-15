// ============================================================
// CÉREBRO v5: Google Places + Casa dos Dados v5 + Apify (WhatsApp)
// ============================================================

const CASA_DOS_DADOS_API_KEY = process.env.CASA_DOS_DADOS_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.CHAVE_API_DO_GOOGLE_MAPS;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

const CNAE_MAP = {
  'posto': '4731800', 'combustível': '4731800', 'combustivel': '4731800',
  'supermercado': '4711302', 'mercado': '4711302',
  'farmácia': '4771701', 'farmacia': '4771701', 'drogaria': '4771701',
  'restaurante': '5611201', 'advogado': '6910601', 'advocacia': '6910601',
  'clínica': '8630501', 'clinica': '8630501',
  'oficina': '4520001', 'mecânica': '4520001', 'hotel': '5510801',
};

function normalizar(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
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

// ==== Casa dos Dados ====
async function buscarEmpresasCasaDados(cnae, municipio, uf) {
  if (!CASA_DOS_DADOS_API_KEY) return [];
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

    const response = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa', {
      method: 'POST',
      headers: { 'api-key': CASA_DOS_DADOS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.cnpjs || [];
  } catch { return []; }
}

// ==== BrasilAPI (telefone) ====
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
  } catch { return null; }
}

// ==== Apify (validar WhatsApp em lote) ====
async function validarWhatsAppEmLote(telefones) {
  if (!APIFY_API_TOKEN || telefones.length === 0) return {};

  // Formatar telefones para o padrão esperado (apenas dígitos, com DDI 55)
  const phonesLimpos = telefones.map(t => {
    let d = String(t).replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }).filter(d => d.length >= 12);

  if (phonesLimpos.length === 0) return {};

  try {
    const url = `https://api.apify.com/v2/acts/devscrapper~whatsapp-number-validator/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: phonesLimpos }),
    });

    if (!response.ok) {
      console.error('Apify erro:', response.status, await response.text());
      return {};
    }

    const data = await response.json();
    // Montar um mapa: { "5534999999999": true/false }
    const mapa = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        const num = String(item.phoneNumber || item.phone || '').replace(/\D/g, '');
        const temWhats = item.isRegistered === true || item.hasWhatsapp === true || item.exists === true;
        if (num) mapa[num] = temWhats;
      }
    }
    return mapa;
  } catch (err) {
    console.error('Erro Apify:', err);
    return {};
  }
}

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
    let municipio = '', uf = '';
    if (locMatch) {
      municipio = locMatch[1].trim();
      uf = locMatch[2].trim();
    } else {
      const end = places[0]?.formattedAddress || '';
      const m = end.match(/([^,]+)\s*-\s*([A-Z]{2})/);
      if (m) { municipio = m[1].trim(); uf = m[2].trim(); }
    }

    // === 3) CNAE ===
    const termoLower = query.toLowerCase();
    let cnae = null;
    for (const [key, val] of Object.entries(CNAE_MAP)) {
      if (termoLower.includes(key)) { cnae = val; break; }
    }

    // === 4) Casa dos Dados ===
    let empresas = [];
    if (cnae && municipio && uf) {
      empresas = await buscarEmpresasCasaDados(cnae, municipio, uf);
    }

    // === 5) PRIMEIRO PASS: montar leads base com CNPJ e telefone ===
    const leadsBase = await Promise.all(places.map(async (place) => {
      const nomeGoogle = place.displayName?.text || '';
      let melhor = null, melhorScore = 0;
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
            nome: s.nome, qualificacao: s.qualificacao_socio || 'Sócio'
          }))
        : [];

      let telefoneReceita = null;
      if (usarCasaDados && melhor.cnpj) {
        telefoneReceita = await buscarTelefoneBrasilAPI(melhor.cnpj);
      }

      return {
        place, nomeGoogle, melhor, melhorScore, usarCasaDados,
        socios, telefoneReceita, cnpj: usarCasaDados ? melhor.cnpj : null,
      };
    }));

    // === 6) COLETAR TODOS OS TELEFONES PARA VALIDAR EM LOTE ===
    const telefonesParaValidar = [];
    for (const lb of leadsBase) {
      const tel = lb.telefoneReceita || lb.place.nationalPhoneNumber;
      if (tel && tel !== 'Não disponível') telefonesParaValidar.push(tel);
    }

    // === 7) VALIDAR WHATSAPP EM UMA ÚNICA CHAMADA ===
    const mapaWhatsApp = await validarWhatsAppEmLote(telefonesParaValidar);

    // === 8) MONTAR LEADS FINAIS ===
    const leads = leadsBase.map(lb => {
      const telFinal = lb.telefoneReceita || lb.place.nationalPhoneNumber || 'Não disponível';
      let temWhats = null;
      if (telFinal !== 'Não disponível') {
        let d = String(telFinal).replace(/\D/g, '');
        if (d.length === 10 || d.length === 11) d = '55' + d;
        temWhats = mapaWhatsApp[d] === true ? true : (mapaWhatsApp[d] === false ? false : null);
      }

      const instaHandle = '@' + normalizar(lb.nomeGoogle).replace(/\s+/g, '').slice(0, 20);

      return {
        name: lb.nomeGoogle,
        phone: telFinal,
        location: lb.place.formattedAddress || 'Endereço não disponível',
        profileUrl: `https://www.google.com/maps/place/?q=place_id:${lb.place.id}`,
        platform: 'google_maps',
        category: query,
        rating: lb.place.rating || 0,
        reviewsCount: lb.place.userRatingCount || 0,
        website: lb.place.websiteUri || null,
        cnpj: lb.cnpj,
        razao_social: lb.usarCasaDados ? lb.melhor.razao_social : null,
        nome_fantasia: lb.usarCasaDados ? lb.melhor.nome_fantasia : null,
        socios: lb.socios,
        telefone_receita: lb.telefoneReceita,
        tem_whatsapp: temWhats,
        match_score: Math.round(lb.melhorScore * 100),
        email: null,
        instagram: instaHandle,
        department: 'Setor de Compras / Gerência',
        decisionMaker: lb.socios[0]?.nome
          ? `${lb.socios[0].nome} (${lb.socios[0].qualificacao})`
          : 'Proprietário / Gerente',
        trendingInsights: [`📍 Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: lb.usarCasaDados ? Math.round(lb.melhorScore * 100) : 60,
      };
    });

    leads.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const comWhats = leads.filter(l => l.tem_whatsapp === true).length;
    const comCnpj = leads.filter(l => l.cnpj).length;

    res.status(200).json({
      leads,
      meta: {
        intent: 'google_places_enriched_whatsapp',
        summary: `${leads.length} resultados. ${comCnpj} com CNPJ. ${comWhats} com WhatsApp ativo.`,
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
