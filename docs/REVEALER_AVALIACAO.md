# Revealer: avaliação opcional, sem integração ativada

Consulta documental real em 14/10/2026: [API](https://revealer.us/docs), [preços](https://revealer.us/pricing) e `GET https://revealer.us/api/socialscrape/platforms?mode=username`. O catálogo público respondeu success=true, source=live, release `20261008T124549Z-cf53116f2159`; instagram, facebook e tiktok estavam em modo username, callable=single. Nenhuma busca autenticada ou crédito consumido. Acesso à documentação foi inicialmente bloqueado pelo proxy; nova tentativa após mudança observada de conectividade passou.

## Contribuição para B2B

Atualização/verificação da disponibilidade e de informações públicas de **um perfil comercial já identificado por URL e plataforma**, associado à empresa por evidência independente (site oficial ligando ao perfil ou confirmação do operador). Pode reduzir perfil desatualizado na ficha empresarial. Não revela quem quer comprar produto/cidade, não comprova titularidade, não gera contato ausente, nem associa contas de plataformas diferentes por username.

**Conclusão:** seleção de plataforma é documentada; filtro “somente empresa/comercial” e esquema uniforme de campos públicos não são. A restrição comercial deve ser aplicada pelo Blitz, antes da chamada. Não é adequado como motor do radar. Integração não implementada nem declarada funcional.

## Endpoint e campos

Candidato: `POST https://revealer.us/api/socialscrape/scrape`, Authorization Bearer no servidor, corpo **somente** `{"username":"HANDLE_DO_PERFIL_JA_CONFIRMADO","platforms":["instagram"]}` (ou uma única plataforma conhecida). `platforms` seleciona o trabalho upstream, segundo a documentação. Nunca omitir: a omissão consulta todo o corpus. SSE `/api/socialscrape/stream` também permite seleção, mas pode levar até 120 s em username, incompatível com depender de uma função Vercel síncrona de 60 s. Preferir job externo se vier a ser implementado.

Resposta candidata: `data.results[plataforma].success`, `data.results[plataforma].profile`, `data.scraped_at`, `data.status`, `data.complete`, `data.expected/completed/failed/missing`. O objeto `profile` é exemplificado como `{...}`: campos por rede **não comprovados em teste real**. Antes de implementar a projeção é preciso obter contrato/amostra real de um perfil comercial autorizado. Projeção proposta: URL exata do perfil, nome público, descrição comercial e website público, somente se presentes e documentados; sourceUrl da plataforma, origem Revealer/módulo, scraped_at e retrievedAt local. Não inferir telefone/e-mail ou verificação comercial; ausência e erros ficam como desconhecidos.

## Plano, limites e custo

- Pro: **US$ 79,99/mês**, faturamento mensal anunciado; API não incluída em Starter/Basic.
- 500 buscas API/semana, 1 requisição/s, até 3 IPs de saída autorizados. Reinício segunda 00:00 UTC. Enterprise por orçamento.
- SocialScrape custa 0 tokens sociais nos planos pagos, mas **consome uma requisição da cota semanal API**. Não é gratuito. Não foi confirmado preço de excedente; documentação indica bloqueio até reset ou negociação de plano.
- 500 buscas sociais/dia do dashboard são uma cota separada, não 500 chamadas API/dia.
- Vercel pode não ter egress fixo; exige saída estável autorizada no provedor. Confirmar opção/custo do worker/NAT antes de contratar. Hospedagem/egress/taxas são separados da assinatura.
- 429/partial/timed_out/provider error não viram “perfil inexistente”; não repetir automaticamente chamadas que podem consumir cota.

## Impedir consultas fora do escopo

Se posteriormente aprovado para implementação: feature flag desativada por padrão; handler Firebase autenticado; seleção de uma ficha empresarial com URL e evidência comercial existentes; derivar handle da URL de domínio exato, e plataforma desse domínio, no servidor. Allowlist fixa de **um** módulo username por requisição, sem repassar corpo livre do cliente. Negar inputs email/phone, platform arrays múltiplos e pesquisas globais. Egress só ao endpoint SocialScrape autorizado. Não expor `/api/resolve`, `/api/database/*`, `/api/stealer-logs/*`, people/AI discovery ou enumeração pessoal. Descartar `cross_references` e resultados de outros módulos, nunca unificar por nomes/handles semelhantes. Cache por plataforma + URL comercial exata; auditoria sem chave nem dados desnecessários; teto semanal/diário e nenhuma chamada ao carregar tela ou fazer busca de compradores.

A filtragem de resposta no Blitz não prova que o fornecedor só retornará dados comerciais; o fornecedor não documenta `business_only`. Se essa separação upstream for requisito, solicitar confirmação contratual antes de integrar.

## Testar sem cobrança automática

1. Testes offline de restrição de endpoint/corpo/plataforma/projeção com fixtures: zero tráfego externo e mock que falha para qualquer outro endpoint.
2. Catalogo público `GET /api/socialscrape/platforms?mode=username` para confirmar um módulo, sem chave. Foi o único endpoint Revealer testado além das páginas documentais.
3. Documentação não anuncia sandbox/dry-run gratuito de busca real. `GET /api/v1/verify` é descrito como verificação de acesso/cota, mas não foi chamado e não substitui teste de perfil.
4. Um teste real de perfil somente por execução manual explícita, com chave do plano Pro, saída autorizada, alvo comercial conhecido, reserva de uma requisição e registro da cota antes/depois. Nunca rodar em CI, startup, smoke automático ou fallback do radar.

Nenhum segredo Revealer foi solicitado/adicionado e nenhuma dependência foi instalada para esse serviço.
