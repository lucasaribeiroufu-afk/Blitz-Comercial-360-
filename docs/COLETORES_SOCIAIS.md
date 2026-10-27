# Coletores públicos: implementação e limites de validação

## Estado em 14/10/2026

Código entregue na mesma branch do PR nº 1. **Coleta funcional nas três plataformas ainda não comprovada.** Há adapters para DOM público visível, worker executável, Dockerfile/Compose, API autenticada server-to-server, catálogo e integração ao radar. Não há contorno de login, CAPTCHA, robots ou grupo privado. Instalar uma biblioteca/testar fixtures não certifica acesso às redes.

### Testes reais de acesso

Smoke manual: `cd worker && npm run smoke -- https://www.instagram.com/instagram/ https://www.facebook.com/Meta/ https://www.tiktok.com/@tiktok`. Resultado em 14/10/2026 19:40:28 UTC (16:40:28 Brasília), Node 24.19.0/Chromium 154.0.8037.57; testes posteriores de código feitos em Node 22.23.3.

| Plataforma / URL consultada | Publicações/comentários coletados | Evidência ou bloqueio preciso |
|---|---:|---|
| Instagram — https://www.instagram.com/instagram/ | 0 | robots.txt negou leitura para Blitz360-EvidenceCollector/1.0; nenhuma navegação ao perfil feita pelo worker |
| Facebook — https://www.facebook.com/Meta/ | 0 | robots.txt negou leitura para o mesmo agente; sem publicações/comentários |
| TikTok — https://www.tiktok.com/@tiktok | 0 | robots permitiu a URL testada; Chromium interrompeu TLS com net::ERR_CERT_AUTHORITY_INVALID, antes da extração |

Evidência textual de comprador: **nenhuma**, pois não houve conteúdo coletado. Não são resultados de “zero compradores”. As tentativas curl iniciais das três URLs tiveram CONNECT 403 do proxy; após alteração observada de conectividade o worker chegou aos bloqueios acima. O log manual não contém credenciais. A revisão automática negou adicionar a CA do proxy à confiança persistente do Chromium; a alteração não foi aplicada. Não se usou ignoreHTTPSErrors, --ignore-certificate-errors ou alteração de checksums. Não usar container/outro navegador para contornar essa decisão sem autorização.

Instaloader 4.15.4 instalado somente em /tmp para avaliação: `Profile.from_username(context, 'instagram')` anônimo, uma tentativa, retornou username `instagram`. Isso é **um metadado de perfil**, não publicação/comentário, nem exemplo de comprador. A execução ocorreu antes de diagnosticar a restrição robots; não foi repetida para contorná-la. Não selecionado como dependência: não resolve Facebook/TikTok e conteúdo/comentários acessíveis sem login não foram demonstrados.

Crawlee 3.18.2 instalado somente em /tmp: importação/fila BasicCrawler processou um item com handler local, sem coleta de rede. Npm reportou engines >=16 e atualização em 14/10/2026. Teste demonstra compatibilidade de fila, não acesso às plataformas. Não selecionado: a fila de até nove fontes/20 s já é limitada explicitamente, e Crawlee não resolve robots, autenticação ou TLS. Playwright-core 1.64.1 (Apache-2.0, Node >=20) selecionado **para o runtime de navegador**, com lockfile e Chromium do sistema; funciona em teste real de navegador local. Não alegamos acesso público superior ao de outras bibliotecas sem comprovação. robots-parser 3.0.1 mantido.

## Fluxo e diagnóstico

1. Firebase continua protegendo as rotas Vercel/Express existentes. Layout, login, regras Firestore e contatos B2B preservados.
2. Nicho + cidade selecionam um catálogo público configurado no worker (`WORKER_SOURCE_CATALOG`), ou recebem URLs no campo já existente. Descoberta gratuita tem cobertura **limitada ao catálogo e aos links visíveis de publicações nos perfis**; não simula busca global.
3. Worker usa contexto novo por fonte, sem cookies persistidos/credenciais de rede social. Verifica robots antes de visitar. Perfil público pode produzir links de posts na fila; post/comment só é registrado com texto visível, autor no mesmo bloco e permalink da mesma plataforma.
4. Instagram: caption em article/h1/header; comentários em li com autor próprio. Facebook: artigos públicos/post_message e comentários com autor próprio. TikTok: descrição/comentários via data-e2e. Seletores podem divergir do layout real; zero blocos reconhecidos é bloqueio/incompatibilidade, não sucesso. Não são chamados endpoints internos não documentados nem lidas mensagens/dados ocultos para ampliar acesso.
5. Classificação existente conserva produto exato/variantes, compradores vs vendedores (descarte separado), intenção ausente, data, região declarada/citada e desconhecida. Grupo/cidade do vendedor não comprovam região do autor. Região desconhecida permanece em seção própria sem salvar automaticamente como comprador local.
6. Evidências incluem URL/texto/autor/data fornecida + horário real da coleta e collector. Data de publicação ausente continua ausente. Telefone/email só do próprio texto com declaração explícita; não se prometem campos ausentes.
7. Só após faltar conteúdo qualificado, descoberta Serper e Apify podem funcionar com **orçamento e ledger persistente existentes**. Fontes descobertas pelo Serper passam pelo worker antes de iniciar Actors quando há tempo. Se worker atender à quantidade, não inicia Actor. Serper já consumiu sua reserva; não há promessa de descoberta gratuita ampla. Apify continua alternativa externa limitada, não exige novo serviço obrigatório. Nenhum Actor foi iniciado nesta sessão: token/orçamento ausentes.

## Limites, cache e paginação

- 6 fontes por chamada, máximo 9 URLs fornecidas; fila deduplicada, até 50 candidatos internos e 9 fontes pendentes retornadas. 2 viewports por padrão, máximo 3; 100 registros por padrão, máximo 200. Scroll é paginação limitada do conteúdo visível, não cobertura completa nem recuperação garantida de todos os comentários. Sem clicar em login/“resolver CAPTCHA”.
- Worker: uma chamada concorrente; 18 s padrão, máximo 20 s; falha 429 se ocupado. Contextos fechados em timeout e browser no finally. Conteúdo máximo 6.000 caracteres/registro; limite de bytes declarados de respostas 8 MB, imagens/mídia/fontes bloqueadas. Memória do container limita também respostas sem Content-Length.
- Cache de conteúdo por URL + limites no worker por 15 min, até 100 entradas, preserva retrievedAt. Cache não durável e não compartilhado entre réplicas; pode ocorrer nova leitura gratuita entre réplicas. Não cria nova cobrança paga por si só. Ledger/cota pagos permanecem no Firestore.
- Dedup por plataforma, publicação, autor exato e texto; nunca correlação de usuários entre redes. Reporta fonte parcial quando limitada com registros e indisponível quando sem acesso. Comentários diferentes preservam autores separados.
- API usa deadline global 45 s, requests ao worker até 21 s; Vercel maxDuration existente 60 s, cliente 55 s. Worker + dois feeds + APIs pagas compartilham deadline. Pendências aparecem no resultado/UI e podem alimentar “Carregar mais”, sem paginação automática. Runs Apify são assíncronos com polling existente.
- Egress do browser: domínio exato da plataforma e CDNs estáticos explicitamente listados no código; novos hosts/layouts exigem revisão. Não recebe URLs arbitrárias para navegar, portas privadas ou perfis associados por similaridade. Permissões de site/robots continuam necessárias.

## Implantação: Vercel permanece interface/API

1. Em servidor Linux externo com Docker/Compose, provisionar inicialmente **1 vCPU, 2 GB RAM, 512 MB /dev/shm**, disco para Chromium/imagem e saída HTTPS. É recomendação inicial, não teste de carga. O worker guarda cache em memória; não precisa banco próprio para gasto pago.
2. `cd worker && docker compose build`. Configure `SOCIAL_WORKER_TOKEN` via secret do host (gerar `openssl rand -hex 32`, nunca enviar no chat/Git). Mesma chave somente no servidor Vercel e worker. `WORKER_SOURCE_CATALOG` é opcional JSON com query/location/url explicitamente aprovados; não inclua cookies ou segredos. URLs comerciais de perfis podem descobrir posts, mas aprovação de catálogo não sobrepõe robots.
3. `docker compose up -d`. Porta só em 127.0.0.1:8080. Configure reverse proxy HTTPS com certificado público válido e hostname próprio; não exponha porta HTTP diretamente. Filtre egress no host para redes/CDNs necessários, limite tráfego e não permita redes privadas/metadados. Não habilite login de redes no worker.
4. Confirme health por requisição interna: GET /health → status ok. POST /collect sem token → 401. Depois configure Vercel > Environment Variables `SOCIAL_WORKER_URL=https://worker.seudominio.com` (origem sem path), `SOCIAL_WORKER_TOKEN`, Preview e Production conforme necessidade; rede Vercel deve alcançar esse host. Rede Codex exige incluir esse hostname nas configurações se for testar daqui. Nenhum deploy externo foi realizado nesta sessão.
5. Faça o redeploy da branch/Preview pelo processo existente. Com conexão ausente, a UI/relatório mostra **“worker não configurado”**, sem resultado fictício. Com conexão inválida, mostra HTTP/timeout bloqueado. Presença de variáveis não comprova disponibilidade.
6. Primeiro teste autenticado manual com uma URL pública cuja leitura seja permitida: orçamento pago vazio; comparar URL, recebido, texto, autor, data, cache e os descartes no relatório JSON. As fixtures não substituem esse teste.
7. Só então configurar Apify/Serper/ledger/orçamento nas variáveis existentes; validar Actor/preço/permissão e limite de gasto com um alvo público aprovado. A reserva é teto, não fatura. Não ativar chamadas pagas em smoke/CI/startup.

### TLS/proxy em ambiente gerenciado

Mantenha HTTP_PROXY/HTTPS_PROXY/NO_PROXY e CA fornecidos pela plataforma. Dockerfile aceita BuildKit secrets públicos `proxy_ca` e `proxy_bundle` nos passos de rede, sem copiar CA para camadas. Exemplo de build: `docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" --secret id=proxy_bundle,src=/etc/ssl/certs/ca-certificates.crt -t blitz-worker worker`. Não alterar DOCKER_CONFIG/credenciais. Chromium precisa confiar na CA: entrypoint possui suporte **opt-in**, quando o operador monta uma CA verificada e define NODE_EXTRA_CA_CERTS; fora de um proxy não configure CA extra. Neste ambiente essa autorização de confiança está pendente; não executamos esse caminho. Não desative TLS para obter resultado.

### Custos e requisitos

Coleta via Chromium não cobra API social, mas servidor, CPU/RAM, banda, domínio e operação **têm custo**. Não foi contratado provedor nem verificada tabela: obter preço de VM/container 1 vCPU/2 GB no provedor escolhido. Browser frio e tráfego podem exigir mais recursos. Docker/Chromium e permissões do site necessários. Serper e Apify dependem de conta/tabela/Actors; permanecem bloqueados sem orçamento diário/por busca, ledger, concorrência e teto PAY_PER_EVENT comprovado. Créditos gratuitos não são presumidos e saldo não foi validado. Vercel/Firestore também podem cobrar. Revealer é separado: [avaliação](REVEALER_AVALIACAO.md), sem dependência obrigatória.

## Verificação da entrega

58 testes da aplicação + 3 testes do worker passaram em Node 22.23.3; extração de fixtures em Chromium real, sem acesso externo. Processo real worker: health 200, coleta sem token 401, catálogo vazio diagnosticado sem tráfego pago. Lint/build passaram; bundle grande continua sendo aviso. Login Firebase não foi substituído nem simulados resultados de plataformas declarados reais. Docker build passou com dependências verificadas e CA pública montada somente nos passos de build, sem adicionar CA à confiança do Chromium em runtime. Implantação externa, sessão Firebase real, coleta autorizada de conteúdo das três redes e custos faturados continuam pendentes.

A imagem construída também passou no teste real **interno ao container**, como usuário `node`: health 200, chamada sem token 401 e renderização/extração de DOM no Chromium. A primeira tentativa encontrou permissão insuficiente no entrypoint e foi corrigida com COPY --chmod=0644. O teste posterior passou. Conexão via porta publicada a partir do container externo Codex não foi comprovada; não é alegado funcionamento de um endpoint externo. Nenhuma CA adicional foi instalada no Chromium nesse teste, e não houve tráfego para plataformas sociais.
