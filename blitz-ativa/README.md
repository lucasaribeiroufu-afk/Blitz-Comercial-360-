# Blitz Ativa

Serviço próprio de coleta pública B2B e B2C, versão 0.2. Serper e Apify permanecem na prospecção principal do Blitz 360. O Blitz Ativa é acionado quando as fontes informam falta de créditos ou quando o orçamento diário configurado se esgota. Também pode ser iniciado manualmente.

O serviço lê fontes HTTPS cadastradas, descobre links do mesmo domínio e consulta propostas abertas do PNCP. Guarda os resultados e o relatório em SQLite e oferece API autenticada para integração. Usa os módulos de normalização, análise de páginas e classificação de intenção já existentes no Blitz 360.

## Executar

Requer Node.js 22.13 ou superior, dependências da raiz instaladas e disco persistente para SQLite. Execute os comandos na raiz do repositório.

```sh
npm ci
npm run ativa:test
npm run ativa:run -- blitz-ativa/example.json
```

O exemplo consulta tinta impermeabilizante em Uberlândia pelo PNCP. Os resultados reais dependem da disponibilidade da fonte e dos itens publicados. A saída JSON inclui ID da execução, estado, evidências, limitações e registros. A execução permanece em `blitz-ativa/data/blitz.sqlite`, ignorado pelo Git.

Para coletar páginas ou feeds, coloque URLs em `sources` no arquivo JSON. O operador deve selecionar fontes públicas cuja coleta seja permitida. A profundidade e o número de páginas são limitados no arquivo de entrada. Para feeds, o coletor segue links locais até publicações estruturadas e aplica os mesmos critérios de autoria e data.

## API

Configure `BLITZ_ATIVA_TOKEN` no ambiente com um segredo de pelo menos 32 caracteres. Uma opção local é `export BLITZ_ATIVA_TOKEN="$(openssl rand -hex 32)"`. Guarde o valor no gerenciador de segredos para uso por clientes autorizados.

```sh
npm run ativa:start
```

O endereço padrão é `http://127.0.0.1:9090`. `GET /health` informa a versão. As demais rotas exigem `Authorization: Bearer <segredo>`.

```sh
curl --fail-with-body http://127.0.0.1:9090/v1/jobs \
  -H "Authorization: Bearer $BLITZ_ATIVA_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @blitz-ativa/example.json
```

`POST /v1/jobs` retorna HTTP 202 e `statusPath`. Consulte esse caminho com o mesmo cabeçalho de autorização até `status` ser `finished` ou `failed`. O campo `report.state` diferencia coleta completa, parcial e indisponível. Uma execução finalizada pode ter fontes indisponíveis.

A fila permite até dez execuções pendentes. Cada processo executa uma por vez. Reservas atômicas, renovação periódica e identificação do proprietário impedem que uma execução antiga sobrescreva uma retomada. Após interrupção, a execução volta a ficar disponível quando a reserva de 60 segundos expira. A coleta recomeça pelas fontes iniciais e o resultado final é deduplicado por identidade estável dentro da execução. Execuções distintas mantêm histórico separado.

Variáveis opcionais são `BLITZ_ATIVA_PORT`, `BLITZ_ATIVA_HOST` e `BLITZ_ATIVA_DB`. Para disponibilizar em outro computador, use servidor com HTTPS, segredo no backend e volume persistente. O banco contém os contatos empresariais coletados e deve ter backup e controle de acesso. A versão atual é destinada a um operador ou organização por instalação.

## Critérios de qualificação

| Tipo | Evidência necessária |
| --- | --- |
| `potential_company` | Organização estruturada no próprio domínio e contato empresarial publicado quando disponível |
| `purchase_mention` em página | Pedido textual explícito, produto correspondente, autor empresarial estruturado, URL, data recente e região compatível ou busca nacional |
| `purchase_mention` no PNCP | Item correspondente ao produto, órgão identificado, publicação válida e recebimento de propostas aberto |
| `region_unconfirmed` | Pedido empresarial com produto e data válidos, cuja região solicitada permanece sem comprovação |

Cada pedido preserva trecho, origem e data de consulta. Páginas HTML incluem hash do conteúdo observado. A publicação precisa de revisão antes de uma abordagem. O PNCP informa o canal de proposta quando ele está publicado. Compatibilidade técnica do produto, condições comerciais e habilitação dependem de verificação específica.

## Cobertura e limites atuais

Sem URLs, a consulta ativa descoberta automática por produto. O índice público Mwmbl fornece candidatos para leitura, sujeito à quota anônima e à cobertura disponível. Um resultado do índice guarda somente URL, título, consulta e propósito, sem qualificação de comprador. BLITZ_ATIVA_SEARXNG_URL aceita a origem HTTPS de uma instância SearXNG autorizada com formato JSON habilitado para ampliar a descoberta por redes e experiências. A ausência de resultados no índice não comprova ausência de compradores. A API do PNCP é consultada em três modalidades, com páginas configuráveis, até três páginas de itens por edital, teto de 40 requisições e janela de 120 segundos. O relatório expõe cortes e falhas. Títulos genéricos também têm seus itens consultados, até os limites informados.

Publicações precisam de autor estruturado e identificado, como Organization ou Person, data recente, URL e pedido explícito correspondente ao produto. O campo audience aceita b2b, b2c ou both. Requisições antigas sem esse campo preservam b2b. A interface inicia com ambos selecionados. Em b2c, a consulta PNCP e as empresas potenciais ficam desativadas. Pessoas físicas entram apenas por pedido publicado, com entityType pf. O coletor próprio preserva o texto original como evidência e não extrai telefone ou e-mail de pessoas para campos de contato. Sites que dependem de JavaScript ainda precisam de um conector específico. `robots.txt`, login, CAPTCHA, HTTP 401/403/429 e falhas de acesso são tratados como bloqueios observáveis. Redirecionamentos passam pela verificação de domínio e de robots antes da próxima requisição. Endereços privados e credenciais em URL são bloqueados, e o DNS público é fixado na conexão.

O intervalo entre pedidos ao mesmo domínio é de pelo menos um segundo, respeitando `Crawl-delay` até 60 segundos. Fontes que exigem intervalo maior ficam registradas como bloqueadas para esta janela de execução. O limite do documento é 1,5 MB por resposta e o prazo de rede é de oito segundos.

As chamadas a provedores pagos são zero neste módulo. Máquina, rede, energia, hospedagem, disponibilidade das fontes e manutenção determinam o custo operacional e a latência.

## Interface, CRM e alternativa automática

A área `#blitz-ativa` do aplicativo usa a sessão Firebase existente. O navegador chama `/api/ativa`, que verifica o usuário antes de consultar o serviço com o segredo do backend. Configure `BLITZ_ATIVA_URL` com a origem HTTPS do serviço e `BLITZ_ATIVA_TOKEN` com o mesmo segredo nos ambientes do serviço e do Blitz 360. A URL e o segredo ficam no servidor.

A interface oferece formulário de coleta, histórico, fontes cadastradas, quantidade de documentos indexados, evidências, relatórios e a ação Salvar no CRM. A gravação recupera os registros originais do serviço, verifica a conta e usa a transação de deduplicação do CRM. Registros com região pendente exigem revisão e têm a gravação automática desativada.

O esgotamento explícito de créditos, HTTP 402, limite mensal insuficiente no Apify, orçamento diário e limite diário de consultas Serper acionam a alternativa. Erros de login, CAPTCHA, HTTP 403/429 e timeouts mantêm sua classificação de falha. Os provedores pagos continuam disponíveis nas próximas consultas, conforme seus limites. Chaves de repetição evitam duplicação da execução alternativa em retentativas dentro da janela de quinze minutos.

## Índice de descoberta

O catálogo e o índice são separados por conta. Cadastre até 200 fontes com nome, URL e palavras-chave. Elas podem apontar para páginas, RSS, Atom ou sitemaps XML. O coletor segue links do mesmo domínio dentro dos limites da execução. O texto de documentos acessíveis é indexado com SQLite FTS5. Uma nova consulta sugere até vinte fontes por correspondência de termos e faz nova leitura antes de qualificar pedidos. O índice retém até dez mil documentos por conta e usa documentos consultados nos últimos noventa dias para descoberta. Ele cobre as fontes percorridas, com ampliação gradual pelo catálogo.

## Implantação persistente

`blitz-ativa/render.yaml` descreve um serviço Node com disco de 1 GB montado em `/var/data`, banco em `/var/data/blitz.sqlite`, segredo gerado pela plataforma e verificação `/health`. A região proposta é Virginia. A integração à main, a seleção de workspace, a aprovação de despesas, o preenchimento das variáveis no Blitz 360 e a verificação de reinício em produção fazem parte da implantação.

Em 21/11/2026, a referência pública do Render informa US$ 7/mês pelo plano `0.5c-512mb` e US$ 0,25/GB/mês pelo disco. A proposta mínima soma aproximadamente US$ 7,25/mês, além de eventuais tributos, tráfego excedente e custos do plano de workspace. O arquivo preparado não representa contratação ou implantação concluída. [Preços consultados](https://render.com/pricing.md)

Para executar em máquina própria com volume persistente, use `docker compose -f blitz-ativa/compose.yaml up --build -d`, com `BLITZ_ATIVA_TOKEN` no ambiente. O serviço fica acessível no loopback da máquina. Uma implantação acessível pelo Blitz 360 hospedado exige origem HTTPS alcançável por esse backend. Preserve o volume `ativa-data` e faça backup consistente do SQLite por ferramenta nativa. O custo de infraestrutura depende da máquina e da operação escolhida.

## Referências verificadas

- [API de consultas PNCP](https://pncp.gov.br/api/consulta/swagger-ui/index.html)
- [Consulta de itens PNCP](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html)
- [SQLite no Node.js](https://nodejs.org/api/sqlite.html)
- [Crawlee e opções de controle de coleta](https://crawlee.dev/js/api/http-crawler/interface/HttpCrawlerOptions)

O coletor desta versão usa HTTP direto e as bibliotecas já instaladas no projeto. A documentação do Crawlee serviu de referência para avaliar filas, limites e execução de crawlers.

## Canais B2C

A busca principal possui conectores Apify para grupos do Facebook, comentários do Instagram e TikTok, sujeitos a configuração, créditos e acesso. O coletor próprio aceita URLs dessas plataformas e de outros sites quando a página pública acessível oferece publicação estruturada. Reconhece a plataforma pelo domínio. Sites que apresentam somente conteúdo dinâmico ou exigem login precisam do conector correspondente. Uma fonte bloqueada aparece no relatório. A ampliação B2C foi validada com publicações de teste, com coleta social real e implantação ainda pendentes.

## Alternativas e experiências publicadas

A consulta aceita até doze termos em alternatives, configuráveis para qualquer produto. A interface oferece esse campo. Os termos são alternativas comerciais para pesquisa e exigem revisão de compatibilidade. A descoberta busca candidatos relacionados ao produto. O operador revisa quais deles são concorrentes e informa alternativas de aplicação. Equivalência técnica entre produtos exige documentação.

O coletor próprio registra pedido atual, pergunta de preço, compra passada e experiência positiva ou negativa. Cada observação exige autor, data recente, URL e menção textual ao produto ou à alternativa. O preço só recebe campo próprio quando o autor declara quanto pagou. Experiências e perguntas ficam no histórico para revisão. A importação ao CRM continua limitada aos tipos já autorizados.

A coleta própria configurada também pode iniciar sem erro de créditos nos caminhos de conclusão do radar. Seu acionamento não depende do limite financeiro das APIs pagas. Essa alteração não fornece hospedagem nem acesso às plataformas. As chamadas pagas continuam sujeitas ao orçamento. O modo integrado funciona na infraestrutura existente. O serviço dedicado no Render é opcional.

## Reclame Aqui

A interface oferece descoberta manual por produto e região no Reclame Aqui. URLs públicas podem entrar no catálogo. Avaliações estruturadas do tipo Review são reconhecidas quando há autor, data recente, produto e texto. Identifica-se a plataforma como reclame_aqui. Páginas sem autor ou metadados suficientes exigem revisão e não originam comprador automaticamente. Estado respondida não demonstra resolução. A situação atual deve ser conferida na reclamação, incluindo a manifestação final do consumidor. A leitura real encontrou páginas acessíveis e HTTP 403 em outra publicação. O atalho de pesquisa não representa coleta automática concluída. Contatos do SAC presentes nas respostas pertencem ao fornecedor, não ao reclamante.

## Execução integrada ao Blitz

Quando BLITZ_ATIVA_URL não está configurada, a API usa o coletor HTTP próprio no ambiente do Blitz e guarda catálogo e execuções no Firestore já utilizado pelo aplicativo. Esse modo precisa das credenciais Firebase existentes. As buscas são iniciadas pelo usuário e executam até doze páginas e cinquenta registros em uma janela de quarenta segundos. O relatório registra cobertura parcial e fontes bloqueadas. Não usa PNCP nem o índice SQLite dedicado. A contratação de Render passa a ser opcional para esse modo. Cotas de execução, rede e Firestore da infraestrutura continuam aplicáveis.

A nova área Públicos de concorrentes organiza produto, região, segmento, projetos e publicações para coleta com os conectores existentes. Oferece atalhos de descoberta manual e revisão dos pedidos antes de salvar no CRM. O vídeo de referência mostra Mailerfind conectado ao Claude por MCP. Mailerfind exige conta, autorização e créditos próprios. Essa conexão externa não foi criada. O módulo próprio não extrai automaticamente seguidores e não infere compra a partir dessa relação. A descoberta automática inicial e a interpretação contextual estão disponíveis. A cobertura social ampla continua dependente dos índices e dos conectores de cada plataforma.

## Descoberta e comentários contextuais

A interface inicia a descoberta automática mesmo quando recebe links opcionais. A API e a CLI ativam a descoberta por padrão quando a entrada está sem fontes. `discover: true` também amplia consultas com fontes informadas. As URLs efetivamente lidas no modo integrado entram no catálogo da conta para reutilização. O histórico registra candidatos e falhas de descoberta.

O modo sem chave consulta o índice Mwmbl com até duas pesquisas por execução e intervalo de 1,1 segundo. O serviço publica limite anônimo de 1.000 requisições mensais por IP. Um HTTP 429 interrompe a descoberta. Seu índice pode retornar zero fontes para produtos brasileiros. Isso limita a cobertura comercial desta configuração. A instância SearXNG configurada executa até quatro pesquisas por produto, região, redes e experiências. Sua operação e seus mecanismos também têm limites próprios.

Comentários JSON-LD aninhados e microdados Schema.org são interpretados junto à publicação pai quando a relação está explícita na página. Respostas curtas como “quero comprar esse produto” preservam texto, autor, data e evidência do contexto, recebem `reviewRequired: true` e dependem de revisão. Perguntas de preço e experiências mantêm categorias próprias. Contexto com vários produtos pesquisados é tratado como ambíguo. A cidade e a data do anúncio não são atribuídas ao comentarista. Páginas ligadas a redes sociais em conteúdo relacionado ao produto entram na fila limitada e passam pelo controle de acesso e robots de cada domínio.

Documentação consultada

- https://developer.mwmbl.org/
- https://docs.searxng.org/dev/search_api.html

## SearXNG próprio

A instância Blitz Search é publicada em https://blitz-searxng.onrender.com. A origem fica em `infrastructure.json` e pode ser substituída por `BLITZ_ATIVA_SEARXNG_URL`. O gateway verifica a sessão Firebase do projeto Blitz usando as chaves públicas do Google. As chaves privadas Firebase permanecem no backend existente. O coletor envia a sessão ao gateway configurado, sem enviá-la às páginas coletadas ou ao índice anônimo. Consultas ficam limitadas por conta e por instância. A interface renova a sessão com o fluxo de login existente.

O container usa a imagem oficial SearXNG e inicializa configuração JSON, quatro mecanismos gerais e autenticação. A instalação gratuita no Render entra em espera quando ociosa. A primeira consulta após essa espera pode inicializar o serviço e exigir uma nova execução. A infraestrutura tem limites de horas compartilhadas, banda, memória e acesso aos mecanismos de pesquisa. Um SearXNG no ar ainda precisa de validação do resultado das consultas.

## Coleta ampla e retomada

`wide: true` habilita lotes persistentes de até 12 páginas dentro da janela de 40 segundos, com teto de 120 páginas, dez lotes e 200 registros por pesquisa. O resultado `waiting` inclui fila pendente e progresso. `POST /v1/jobs/{id}/continue` retoma a mesma pesquisa. Na interface, a fila continua enquanto a página fica aberta. Fechar a página permite retomar pelo histórico. Reservas com identificação própria evitam que uma execução antiga sobrescreva uma retomada. O conteúdo persistido é limitado a 850 KB para caber no documento Firestore.

As fontes sociais descobertas alimentam o worker público já configurado. Instagram, Facebook e TikTok dependem do conteúdo visível permitido a esse conector. Contexto de legenda/post é preservado para comentários quando o vínculo está disponível no DOM. Falhas, acesso exigido e limites aparecem no relatório. O modo amplo consulta também o YouTube se `YOUTUBE_API_KEY` estiver configurada, com até três vídeos e cem comentários recentes por vídeo. Respostas e páginas posteriores continuam fora dessa amostra. A chave precisa de YouTube Data API v3 habilitada e quota disponível. Ausência da chave aparece como configuração pendente.

## Executor em segundo plano

A área Monitoramento salva uma rotina por conta, com produto, região, público e intervalo. As rotinas ficam em `_blitzAtivaSchedules`, com resultados na conta original. `GET /api/ativa` processa um lote de rotina vencida mediante o segredo `BLITZ_ATIVA_CRON_SECRET`, com pelo menos 32 caracteres. O segredo deve ser enviado em Authorization Bearer. POST mantém a autenticação Firebase normal e nunca aceita o segredo de cron como login.

A rotina usa credenciais administrativas existentes para emitir uma sessão curta da própria conta, necessária ao gateway SearXNG. A fila é retomada em novas chamadas do executor. A rotina guarda recibos persistentes em `users/{uid}/ativaSeen` para deduplicar resultados entre execuções, sem depender de uma janela de histórico. Registros permanecem no histórico e dependem de revisão antes de importação ao CRM. O executor não envia contatos nem propostas.

O workflow `.github/workflows/ativa-sweep.yml` está preparado para acionamento manual com o secret de repositório `BLITZ_ATIVA_CRON_SECRET`. A recorrência de GitHub Actions precisa ser definida depois de confirmar a frequência desejada. O intervalo no aplicativo define quando a busca fica vencida, e a frequência do executor determina quando ela será processada. Sem o segredo e o acionamento periódico configurados, salvar uma rotina mantém a configuração pendente.

Para os próximos conectores Meta, são necessários o aplicativo e a modalidade de API autorizada, conta/página empresarial e permissões aprovadas, com autenticação OAuth. Essas permissões determinam quais contas e publicações podem ser lidas. Um token de conta própria não demonstra acesso a comentários de qualquer concorrente ou grupo. O acesso comercial a fontes de terceiros exige verificação específica do conector.
