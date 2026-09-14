export default async function handler(req, res) {
  // Configuração para permitir que o seu aplicativo acesse essa API
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

  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Por favor, forneça um CNPJ ou termo de busca.' });
  }

  // Limpar CNPJ (remover pontos, barras, traços)
  const cnpjLimpo = query.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ error: 'Por favor, insira um CNPJ válido com 14 dígitos.' });
  }

  try {
    // Chamar a BrasilAPI (o link que você testou no navegador)
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    
    if (!response.ok) {
      throw new Error('CNPJ não encontrado na base pública');
    }

    const dados = await response.json();

    // Montar o JSON perfeito que o seu aplicativo vai exibir no Card
    const resultado = {
      nome_empresa: dados.nome_fantasia || dados.razao_social,
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      avaliacao: 4.8, // Valor temporário (depois integramos com Google Meu Negócio)
      endereco: `${dados.logradouro}, ${dados.numero} - ${dados.municipio} - ${dados.uf}`,
      telefone_publico: `(${dados.ddd_telefone_1}) ${dados.telefone_1}`,
      socios: dados.qsa ? dados.qsa.map(socio => socio.nome_socio) : []
    };

    res.status(200).json(resultado);

  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao consultar a BrasilAPI' });
  }
}
