# Blitz Comercial 360 — coleta com proveniência

O motor de prospecção coleta respostas de provedores e páginas públicas. Não utiliza IA para inventar cadastros nem bancos estáticos de supostos compradores. Campos não encontrados ficam vazios. Erros de provedor são exibidos e não geram contatos substitutos.

## O que está implementado

| Caminho | Fonte | Dados coletados | Limites |
| --- | --- | --- | --- |
| B2B `/api/deep-search` | Google Places (New) | Nome, endereço, telefone publicado, site, categoria, avaliação e quantidade de avaliações quando presentes | Filtra município/UF e categoria conservadoramente. Uma empresa listada não demonstra intenção de compra. |
| CNPJ `/api/buscar` ou CNPJ no campo de busca | BrasilAPI | Nome fantasia/razão social, endereço, telefone cadastral, email e QSA se publicados | Consulta CNPJ exato, com dígitos verificadores. Não relaciona CNPJ por semelhança de nomes. QSA não identifica automaticamente comprador/decisor. |
| Radar social `/api/b2c-multifactor-search` + `/api/social-radar` | Serper descobre URLs; Apify coleta dados estruturados de Facebook, Instagram e TikTok | Autor público, perfil, texto do post/comentário, data quando presente e telefone/email oferecido pelo próprio autor | Classificação heurística de produto/intenção. Região deve ser declarada no texto; grupo local não comprova residência. Uma origem por plataforma, até três origens sociais por execução. |
| B2C sem token Apify | Serper + leitura do HTML público | Título e trecho original, com autor não confirmado | Caminho limitado a páginas indexadas. Aviso informa que comentários sociais não foram coletados. |
| `/api/casa-cnpj` | Casa dos Dados v4 | CNPJ exato, nome, endereço e QSA | Não associa sócio a intenção de compra nem adivinha telefone pessoal. |
| Link direto `/api/extract-url` | HTML + JSON-LD de uma única organização | Título e campos declarados pela organização, quando identificada | Sem JSON-LD inequívoco, coleta apenas o título. Não executa JavaScript de páginas nem acessa grupos privados. |
| Consulta de telefone `/api/contacts/resolve-phone` | BrasilAPI | Telefone cadastral do CNPJ informado | Não comprova linha ativa ou WhatsApp. |

Cada campo coletado inclui `evidence[field]` com valor, URL, fonte, instante de coleta e trecho/valor de origem. Os cards e CSV oferecem acesso às evidências. Proveniência significa que o campo foi recebido da fonte, não que sua informação está necessariamente atualizada ou correta. Não existe pontuação automática de “100% real”.

Preços de concorrentes, produtos comprados recentemente, margens e telefone do responsável permanecem ausentes quando não houver fonte. PNCP, Diários Oficiais e Datastone **não estão integrados neste motor**. Os três Actors de comentários sociais são integrados via API Apify, sem uso de cookies ou acesso a grupos privados. Os atalhos de busca manual não representam consultas executadas. `targetEntityType=both` consulta estabelecimentos; para menções B2C selecione o radar B2C.

## Rodar localmente

Requer Node.js 22 ou superior.

```sh
npm ci
cp .env.example .env
npm run dev
```

Abra `http://localhost:3000`. Informe as chaves na cópia local de `.env`, sem adicioná-la ao Git.

## Configurar na Vercel

1. Abra o projeto Blitz Comercial 360 na Vercel.
2. Em **Settings > Environment Variables**, confirme `GOOGLE_MAPS_API_KEY` (ou o nome antigo `CHAVE_API_DO_GOOGLE_MAPS`), `SERPER_API_KEY`, `APIFY_API_TOKEN` e, opcionalmente, `CASA_DOS_DADOS_API_KEY` para Preview e Production, conforme as fontes que pretende usar. Não envie as chaves pelo chat. Não use prefixo `VITE_` para essas chaves.
3. A chave Google precisa permitir **Places API (New)** e ter faturamento/quota disponíveis. A fonte Serper exige conta/chave própria. Apify precisa de saldo/permissão nos Actors `apify/facebook-groups-scraper`, `apify/instagram-comment-scraper` e `clockworks/tiktok-comments-scraper`. A execução é assíncrona, com duração máxima de quatro minutos por Actor, e a interface acompanha o resultado. O teto padrão é US$ 0,50 por Actor (até cinco por busca), ajustável em `BLITZ_APIFY_MAX_USD_PER_RUN`. A BrasilAPI não exige chave.
4. O arquivo `vercel.json` define build, pasta `dist`, funções `/api` e navegação SPA. O Express atende as mesmas rotas no desenvolvimento local.
5. Faça o deploy da branch de revisão e valide o Preview antes de integrar em `main`. O endereço atual da produção não é automaticamente corrigido pela criação da branch/PR.
6. Execute uma consulta B2B com nicho e `Cidade - UF`, uma consulta de CNPJ e uma B2C. Confira cada URL e o campo de origem. Resultados menores que a quantidade pedida são esperados quando faltam evidências.

As rotas de coleta exigem o login Firebase já utilizado pelo aplicativo. Opcionalmente, `BLITZ_ALLOWED_UIDS` restringe quais contas podem consumir fontes pagas. `/api/source-status` informa apenas a presença das variáveis, sem mostrar chaves; não confirma validade ou saldo. APIs não configuradas retornam erro explícito. Falhas HTTP, quotas, páginas bloqueadas e ausência de dados não são mascaradas por cadastros fabricados. O coletor público usa HTTPS, bloqueia endereços internos, fixa resolução DNS por conexão, limita tamanho/tempo e revalida redirecionamentos.

## Dados antigos

Os registros já salvos no Firestore não são apagados automaticamente. Registros antigos sem proveniência continuam marcados como não auditados; a implementação não os transforma retroativamente em dados comprovados. Edições manuais limpam a proveniência para não validar valores alterados com evidências anteriores.

## Validação

```sh
npm run lint
npm test
npm run build
```

Os testes usam fontes simuladas e cobrem fabricação de dados, substituição de nicho/localidade, campos ausentes, erros de provedor, CNPJ, extração estruturada, limites e proteção contra acesso a endereços privados. Eles não substituem testes de ponta a ponta com credenciais reais de Google/Serper.

Documentação da fonte Places: https://developers.google.com/maps/documentation/places/web-service/text-search

## Exemplo regional

Selecione Radar B2C, produto `tinta impermeabilizante` e região `Uberlândia - MG`. A busca reconhece expressões como “quero comprar”, “preciso de”, “procuro” e “onde comprar”, e variações conservadoras do produto. O texto “vendo tinta” é excluído. “Quero comprar tinta branca” não comprova procura por tinta impermeabilizante. “Moro em Uberlândia-MG e quero comprar tinta impermeabilizante” pode qualificar, com link, perfil e texto de origem. Telefone só é associado quando aparece como contato oferecido pelo mesmo autor.

No campo de origens opcionais, cole links de grupos públicos, posts/reels ou vídeos. Em branco, o Serper tenta descobri-los. Não há promessa de cobertura de todas as redes: indexação, bloqueios, disponibilidade dos Actors e ausência de região/contato no texto reduzem a cobertura.

## Avaliação dos anexos OSINT

PhoneIntel parte de um número já conhecido; Tookie procura contas por identificador; SmartImage faz busca reversa de imagens. Eles não fornecem a ligação produto + intenção + autor + região necessária aqui. GrayHatWarfare e EmailOSINT não foram conectados: buckets expostos e dados de vazamentos não são fontes usadas para a prospecção. Nenhum código desses projetos foi copiado.

Documentação dos Actors:
- https://apify.com/apify/facebook-groups-scraper
- https://apify.com/apify/instagram-comment-scraper
- https://apify.com/clockworks/tiktok-comments-scraper
- https://docs.apify.com/api/v2/actors-runs-post

## Marketplaces e coleta comercial adicional

A opção “Analisar também produtos da Shopee e perguntas públicas do Mercado Livre” adiciona dois Actors ao radar:
- `paulovitor18/shopee-brasil-produtos`: produtos, preços, origem do envio e vendidos quando publicados; não retorna contato de comprador nem intenção individual.
- `piotrv1001/mercado-libre-questions-scraper`: perguntas e respostas públicas de um anúncio brasileiro. Nome e data da pergunta não são disponibilizados pelo coletor. Data da resposta não é usada como data da pergunta.

Esses dados aparecem em uma seção própria e não são salvos como contatos no Firestore. Um produto vendido e uma avaliação pós-compra não se tornam um comprador interessado. Região de envio do vendedor não se torna região do comprador. Uma pergunta pode trazer menção regional, mas isso não comprova residência.

Shopee aceita busca pelo produto informado. Para Mercado Livre, o Serper tenta localizar um anúncio; você também pode colar um link `https://produto.mercadolivre.com.br/MLB-...` no campo de origens. Não são admitidos links de login, cookies ou dados privados. O Actor do Mercado Livre usa a configuração de proxy própria do fornecedor e pode exigir saldo/permissão adicional.

A busca B2B consulta até três páginas do Google Places e considera até três sites vinculados para procurar links `mailto:`/`tel:` publicados, incluindo até duas páginas de contato do mesmo site. O site deve mencionar o nome comercial encontrado. Campos não publicados permanecem vazios. O telefone coletado é comercial; não é atribuído a um sócio ou comprador.

BBOT foi avaliado como ferramenta de varredura de infraestrutura, sem função necessária para qualificar intenção de compra. Não foi incorporado. Tookie/PhoneIntel/SmartImage não resolvem ausência de contato ou prova de identidade; nenhum identificador pessoal é correlacionado por coincidência de apelido. EmailOSINT e GrayHatWarfare não são fontes deste projeto.

Integração: esta revisão deve permanecer em branch separada e pull request até a revisão do responsável. Merge em `main` e publicação na Vercel não fazem parte desta etapa. Os resultados da validação desta aplicação estão descritos na solicitação de pull request; as consultas reais às APIs ainda precisam ser comprovadas com as credenciais das respectivas fontes.
