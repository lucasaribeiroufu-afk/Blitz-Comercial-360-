# Blitz Ativa

Serviço próprio de coleta pública B2B, versão 0.2. Serper e Apify permanecem na prospecção principal do Blitz 360. O Blitz Ativa é acionado quando as fontes informam falta de créditos ou quando o orçamento diário configurado se esgota. Também pode ser iniciado manualmente.

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

O rastreador parte das URLs cadastradas. A construção de um índice geral de descoberta e conectores adicionais permanece pendente. A API do PNCP é consultada em três modalidades, com páginas configuráveis, até três páginas de itens por edital, teto de 40 requisições e janela de 120 segundos. O relatório expõe cortes e falhas. Títulos genéricos também têm seus itens consultados, até os limites informados.

Publicações sem metadados empresariais estruturados ficam fora da qualificação automática nesta versão. Sites que dependem de JavaScript ainda precisam de um conector específico. `robots.txt`, login, CAPTCHA, HTTP 401/403/429 e falhas de acesso são tratados como bloqueios observáveis. Redirecionamentos passam pela verificação de domínio e de robots antes da próxima requisição. Endereços privados e credenciais em URL são bloqueados, e o DNS público é fixado na conexão.

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
