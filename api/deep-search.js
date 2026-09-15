// ============================================================
// CÉREBRO v6: Google Places + Data Stone + Credify + Casa dos Dados + Apify
// ============================================================

const GOOGLE_MAPS_API_KEY = process.env.CHAVE_API_DO_GOOGLE_MAPS;
const DATA_STONE_API_KEY = process.env.DATA_STONE_API_KEY;
const CREDIFY_API_KEY = process.env.CREDIFY_API_KEY;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const CASA_DOS_DADOS_API_KEY = process.env.CASA_DOS_DADOS_API_KEY;

// --- Mapeamentos e utilitários ---
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
  'gerente geral', 'comprador'
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

// --- Integrações ---

// 1. Data Stone (Prioridade - busca decisor por CNPJ)
async function buscarDecisorDataStone(cnpj) {
  if (!DATA_STONE_API_KEY) return null;
  try {
    const buscaResponse = await fetch('https://api.datastone.com.br/v1/b2b/persons/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DATA_STONE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pagina: 1,
        por_pagina: 5,
        filtros_empresa: { cnpj: [cnpj.replace(/\D/g, '')] },
        filtros_pessoa: { cargos: CARGOS_DECISORES }
      })
    });

    if (!buscaResponse.ok) return null;
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

    const telefone = enrichData.dados?.telefone || enrichData.dados?.celular;
    if (!telefone) return null;

    return {
      nome: pessoa.nome || enrichData.dados?.nome,
      cargo: pessoa.cargo || enrichData.dados?.cargo,
      telefone: telefone,
      email: enrichData.dados?.email,
      fonte: 'Data Stone'
    };
  } catch (err) {
    console.error('Erro Data Stone:', err);
    return null;
  }
}

// 2. Credify (Fallback 1 - telefones por CNPJ)
async function buscarTelefonesCredify(cnpj) {
  if (!CREDIFY_API_KEY) return [];
  try {
    const response = await fetch('https://api.credify.com.br/pjtelefonecnpj', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CREDIFY_API_KEY}`
      },
      body: JSON.stringify({
        IDCONSULTA: `blitz-${Date.now()}`,
        CPFCNPJ: cnpj.replace(/\D/g, ''),
        TIPOPESSOA: 'J'
      })
    });

    if (!response.ok) return [];
    const data = await response.json();
    const telefones = [];
    if (data.RESPOSTA?.TELEFONES) {
      Object.values(data.RESPOSTA.TELEFONES).forEach(reg => {
        if (reg.TELEFONE) {
          telefones.push({
            numero: `(${reg.DDD}) ${reg.TELEFONE}`,
            whatsapp: reg.WHATSAPP === 'S' || reg.WHATSAPP === true
          });
        }
      });
    }
    return telefones;
  } catch (err) {
    console.error('Erro Credify:', err);
    return [];
  }
}

// 3. Casa dos Dados (Fallback 2 - sócios e CNPJ)
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

// 4. BrasilAPI (Fallback 2 - telefone fixo da Receita)
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

// 5. Apify (validação de WhatsApp em lote)
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

// --- Handler principal ---
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
    // 1. Google Places
    const places = await buscarGooglePlaces(query, location, count);

    // 2. Extrair município e UF
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

    // 3. Determinar CNAE
    const termoLower = query.toLowerCase();
    let cnae = null;
    for (const [key, val] of Object.entries(CNAE_MAP)) {
      if (termoLower.includes(key)) { cnae = val; break; }
    }

    // 4. Buscar empresas na Casa dos Dados (uma vez)
    const empresasCasaDados = await buscarEmpresasCasaDados(cnae, municipio, uf);
    console.log(`Casa dos Dados: ${empresasCasaDados.length} empresas em ${municipio}/${uf}`);

    // 5. Processar cada lead
    const leadsPromises = places.map(async (place) => {
      const nomeGoogle = place.displayName?.text || '';

      // Encontrar CNPJ correspondente
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

      let dadosDecisor = null;
      let telefonesCredify = [];
      let socios = [];
      let telefoneReceita = null;

      if (cnpj) {
        // 5.1. Data Stone (prioridade)
        dadosDecisor = await buscarDecisorDataStone(cnpj);

        // 5.2. Se Data Stone não retornou, tentar Credify
        if (!dadosDecisor || !dadosDecisor.telefone) {
          telefonesCredify = await buscarTelefonesCredify(cnpj);
        }

        // 5.3. Sempre buscar sócios e telefone da Receita como fallback
        socios = (melhorMatch.quadro_societario || []).map(s => ({
          nome: s.nome,
          qualificacao: s.qualificacao_socio || 'Sócio'
        }));
        telefoneReceita = await buscarTelefoneBrasilAPI(cnpj);
      }

      // 6. Coletar todos os telefones para validação
      const telefonesParaValidar = [];
      if (dadosDecisor?.telefone) telefonesParaValidar.push(dadosDecisor.telefone);
     
