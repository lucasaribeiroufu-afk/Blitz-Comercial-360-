// ============================================================
// CÉREBRO v8: Google Places + Data Stone (limitado) + Casa dos Dados + BrasilAPI + Apify
// Estratégia: Máximo 3 créditos Data Stone por busca, com fallback automático
// ============================================================

const GOOGLE_MAPS_API_KEY = process.env.CHAVE_API_DO_GOOGLE_MAPS;
const DATA_STONE_API_KEY = process.env.DATA_STONE_API_KEY;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const CASA_DOS_DADOS_API_KEY = process.env.CASA_DOS_DADOS_API_KEY;

// 🎯 Limite de créditos Data Stone por busca
const DATA_STONE_MAX_LEADS = 3;

const CNAE_MAP = {
  'posto': '4731800', 'combustível': '4731800', 'combustivel': '4731800',
  'supermercado': '4711302', 'mercado': '4711302',
  'farmácia': '4771701', 'farmacia': '4771701', 'drogaria': '4771701',
  'restaurante': '5611201', 'advogado': '6910601', 'advocacia': '6910601',
  'clínica': '8630501', 'clinica': '8630501',
  'oficina': '4520001', 'mecânica': '4520001', 'hotel': '5510801',
};

const CARGOS_DECISORES = [
  'gerente de compras', 'diretor de compras', 'head de compras',
  'coordenador de compras', 'proprietário', 'sócio', 'diretor',
  'gerente geral', 'comprador', 'presidente', 'ceo'
];

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

// --- Data Stone (tenta buscar decisor, com tratamento de erro) ---
async function buscarDecisorDataStone(cnpj) {
  if (!DATA_STONE_API_KEY) return null;
  try {
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    const buscaResponse = await fetch('https://api.datastone.com.br/v1/b2b/persons/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DATA_STONE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pagina: 1,
        por_pagina: 5,
        filtros_empresa: { cnpj: [cnpjLimpo] },
        filtros_pessoa: { cargos: CARGOS_DECISORES }
      })
    });

    if (!buscaResponse.ok) {
      console.warn('Data Stone busca falhou:', buscaResponse.status);
      return null;
    }
    const buscaData = await buscaResponse.json();
    if (!buscaData.dados || buscaData.dados.length === 0) return null;

    const pessoa = buscaData.dados[0];
    const idPessoa = pessoa.id_pessoa;

    const enrichResponse = await fetch('https://api.datastone.com.br/v1/b2b/persons/enrich', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DATA_STONE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id_pessoa: idPessoa })
    });

    if (!enrichResponse.ok) return null;
    const enrichData = await enrichResponse.json();
    const dados = enrichData.dados || {};

    const telefone = dados.telefone || dados.celular;
    if (!telefone) return null;

    return {
      nome: pessoa.nome || dados.nome,
      cargo: pessoa.cargo || dados.cargo,
      telefone: telefone,
      email: dados.email,
      fonte: 'Data Stone'
    };
  } catch (err) {
    console.warn('Erro Data Stone (usando fallback):', err.message);
    return null;
  }
}

// --- Casa dos Dados ---
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
  } catch {
    return [];
  }
}

// --- BrasilAPI ---
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

// --- Apify ---
async function validarWhatsAppEmLote(telefones) {
  if (!APIFY_API_TOKEN || telefones.length === 0) return {};
  const phonesLimpos = telefones
    .map(t => String(t).replace(/\D/g, ''))
    .map(d => (d.length === 10 || d.length === 11) ? '55' + d : d)
    .filter(d => d.length >= 12);
  if (phonesLimpos.length === 0) return {};

  try {
    const url = `https://api.apify.com/v2/acts/devscrapper~whatsapp-number-validator/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: phonesLimpos }),
    });
    if (!response.ok) return {};
    const data = await response.json();
    const mapa = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        const num = String(item.phoneNumber || item.phone || '').replace(/\D/g, '');
        mapa[num] = item.isRegistered === true || item.hasWhatsapp === true || item.exists === true;
      }
    }
    return mapa;
  } catch (err) {
    console.error('Erro Apify:', err);
    return {};
  }
}

// --- Google Places ---
async function buscarGooglePlaces(query, location, count) {
  const searchQuery = location ? `${query} em ${location}` : query;
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
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
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Erro Google Places');
  }
  const data = await response.json();
  return data.places || [];
}

// --- Handler Principal ---
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
    const places = await buscarGooglePlaces(query, location, count);

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

    const termoLower = query.toLowerCase();
    let cnae = null;
    for (const [key, val] of Object.entries(CNAE_MAP)) {
      if (termoLower.includes(key)) { cnae = val; break; }
    }

    const empresasCasaDados = await buscarEmpresasCasaDados(cnae, municipio, uf);
    console.log(`Casa dos Dados: ${empresasCasaDados.length} empresas em ${municipio}/${uf}`);

    // 🔑 PRIMEIRO PASS: montar leads base com CNPJ + score (sem chamar Data Stone)
    const leadsBase = places.map((place) => {
      const nomeGoogle = place.displayName?.text || '';
      let melhorMatch = null;
      let melhorScore = 0;
      for (const emp of empresasCasaDados) {
        const s = Math.max(
          similaridade(nomeGoogle, emp.razao_social || ''),
          similaridade(nomeGoogle, emp.nome_fantasia || '')
        );
        if (s > melhorScore) { melhorScore = s; melhorMatch = emp; }
      }
      const cnpj = (melhorScore >= 0.25 && melhorMatch) ? melhorMatch.cnpj : null;
      const socios = (melhorMatch?.quadro_societario || []).map(s => ({
        nome: s.nome,
        qualificacao: s.qualificacao_socio || 'Sócio'
      }));
      return { place, nomeGoogle, melhorMatch, melhorScore, cnpj, socios };
    });

    // 🔑 ORDENAR por match_score (melhores correspondências primeiro)
    leadsBase.sort((a, b) => b.melhorScore - a.melhorScore);

    // 🔑 SEGUNDO PASS: chamar Data Stone APENAS para os top N leads com CNPJ
    let creditosDataStoneUsados = 0;
    const leadsFinais = await Promise.all(leadsBase.map(async (lb, idx) => {
      let dadosDecisor = null;
      let telefoneReceita = null;

      const temCnpj = !!lb.cnpj;
      const dentroDoLimite = idx < DATA_STONE_MAX_LEADS;

      // 1. Data Stone (apenas top N)
      if (temCnpj && dentroDoLimite && creditosDataStoneUsados < DATA_STONE_MAX_LEADS) {
        dadosDecisor = await buscarDecisorDataStone(lb.cnpj);
        if (dadosDecisor) {
          creditosDataStoneUsados++;
          console.log(`💎 Data Stone usado para ${lb.nomeGoogle} (${creditosDataStoneUsados}/${DATA_STONE_MAX_LEADS})`);
        }
      }

      // 2. BrasilAPI (fallback ou complemento)
      if (temCnpj) {
        telefoneReceita = await buscarTelefoneBrasilAPI(lb.cnpj);
      }

      // 3. Coletar telefones para validação WhatsApp
      const telefonesParaValidar = [];
      if (dadosDecisor?.telefone) telefonesParaValidar.push(dadosDecisor.telefone);
      if (telefoneReceita) telefonesParaValidar.push(telefoneReceita);
      if (lb.place.nationalPhoneNumber) telefonesParaValidar.push(lb.place.nationalPhoneNumber);

      const mapaWhatsApp = await validarWhatsAppEmLote(telefonesParaValidar);

      const telefoneFinal = dadosDecisor?.telefone || telefoneReceita || lb.place.nationalPhoneNumber || 'Não disponível';
      const numeroLimpo = String(telefoneFinal).replace(/\D/g, '');
      const numeroFormatado = (numeroLimpo.length === 10 || numeroLimpo.length === 11) ? '55' + numeroLimpo : numeroLimpo;
      const temWhatsapp = mapaWhatsApp[numeroFormatado] === true ? true : (mapaWhatsApp[numeroFormatado] === false ? false : null);

      // Decisor final: Data Stone > 1º Sócio > Genérico
      const decisorFinal = dadosDecisor || (lb.socios[0] ? {
        nome: lb.socios[0].nome,
        cargo: lb.socios[0].qualificacao,
        fonte: 'Casa dos Dados (QSA)'
      } : null);

      return {
        name: lb.nomeGoogle,
        phone: telefoneFinal,
        location: lb.place.formattedAddress || 'Endereço não disponível',
        profileUrl: `https://www.google.com/maps/place/?q=place_id:${lb.place.id}`,
        platform: 'google_maps',
        category: query,
        rating: lb.place.rating || 0,
        reviewsCount: lb.place.userRatingCount || 0,
        website: lb.place.websiteUri || null,
        cnpj: lb.cnpj,
        razao_social: lb.melhorMatch?.razao_social || null,
        nome_fantasia: lb.melhorMatch?.nome_fantasia || null,
        socios: lb.socios,
        decisor: dadosDecisor,
        telefone_receita: telefoneReceita,
        tem_whatsapp: temWhatsapp,
        match_score: Math.round(lb.melhorScore * 100),
        email: null,
        instagram: `@${normalizar(lb.nomeGoogle).replace(/\s+/g, '').slice(0, 20)}`,
        department: 'Setor de Compras / Gerência',
        decisionMaker: decisorFinal
          ? `${decisorFinal.nome} (${decisorFinal.cargo})`
          : 'Proprietário / Gerente',
        trendingInsights: [`📍 Google Maps: "${query}"${location ? ' em ' + location : ''}`],
        confidence: dadosDecisor ? 100 : (lb.cnpj ? 80 : 60),
      };
    }));

    // Reordenar por confidence
    leadsFinais.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const comWhats = leadsFinais.filter(l => l.tem_whatsapp === true).length;
    const comCnpj = leadsFinais.filter(l => l.cnpj).length;
    const comDecisor = leadsFinais.filter(l => l.decisor).length;

    console.log(`✅ Busca finalizada: ${leadsFinais.length} leads, ${comCnpj} com CNPJ, ${comDecisor} com decisor, ${comWhats} com WhatsApp. Créditos Data Stone usados: ${creditosDataStoneUsados}`);

    res.status(200).json({
      leads: leadsFinais,
      meta: {
        intent: 'google_places_enriched',
        summary: `${leadsFinais.length} resultados. ${comCnpj} com CNPJ. ${comDecisor} com decisor. ${comWhats} com WhatsApp ativo. (Data Stone: ${creditosDataStoneUsados} créditos usados)`,
        targetAudience: 'Empresas locais e decisores comerciais',
        trendingItems: [],
        suggestedPitch: `Abordar os decisores locais com ofertas relevantes para o setor de ${query}.`,
        creditos_data_stone_usados: creditosDataStoneUsados
      }
    });

  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
  }
}
