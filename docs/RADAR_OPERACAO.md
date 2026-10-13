# Radar econômico e contatos profissionais

## Diagnóstico histórico: incompleto

A execução real “pessoas querendo comprar ração”, “Paracatu, MG” retornou zero qualificados. O usuário não possui os JSONs nem IDs dos runs. Não é possível recuperar consultas efetivamente executadas, registros recebidos, erros ou descartes; nenhum número histórico foi inventado.

Antes desta revisão, o fluxo era:
- Com token Apify, links fornecidos/configurados evitavam descoberta. Sem links, Serper fazia até seis consultas: duas variantes em Facebook/Instagram/TikTok. As consultas usavam produto + cidade + expressões de compra.
- Escolhia somente a primeira URL por plataforma, mais marketplaces opcionais. Até 100 linhas por dataset; Facebook podia expandir comentários aninhados.
- Produto/intenção/região/nome/fonte eram filtros binários sem contadores. Exigia declaração como “moro em”, “sou de” ou local de entrega. Grupo local, curtidas e DDD não comprovavam região. Portanto zero poderia ser bloqueio, ausência de origem, dados não coletados, identidade ausente, produto divergente ou região não declarada.
- Sem Apify, usava Serper e HTML indexado, sem autor confirmado. Falhas não geravam contatos sintéticos, mas o relatório não discriminava cobertura, perdas e custos.
- A frase “coleta concluída” podia aparecer após falhas terminais. Não existia teto diário persistente ou deduplicação global de cobranças.

O erro anterior ERR_REQUIRE_ESM foi corrigido em dbc7d16. Firebase Admin permanece fixado em 13.10.0, jwks-rsa 3.2.2 e jose 4.15.9.

## Implementado agora

### Etapa 1: sem chamadas a Serper/Actors

O mesmo endpoint autenticado `/api/b2c-multifactor-search` começa pelo cache e até duas URLs públicas por execução. Até nove URLs podem ser fornecidas; as excedentes aparecem explicitamente como não lidas nessa etapa. HTTP HTTPS com DNS fixado, proteção SSRF, 8 segundos por origem incluindo robots, até três redirecionamentos, limite de 1,5 MB. Não executa JavaScript, login ou CAPTCHA. RSS/Atom e JSON-LD de publicação/comentário preservam texto e autor no mesmo registro. HTML sem autor explícito é contado, mas não cria uma pessoa compradora.

Configure `BLITZ_PUBLIC_ALLOWED_HOSTS` com hosts exatos após verificar que a leitura é permitida. Robots com proibição prevalece; falha de robots bloqueia, exceto HTTP 404. Não configure plataformas privadas nem tente contornar seus bloqueios. Links de pesquisa no relatório são apenas descoberta manual; não contam como coleta.

Cache HTTP em memória é limitado a 100 entradas, separado por UID, tem data e validade, e pode desaparecer num cold start da Vercel. Execuções pagas/resultados têm cache persistente no Firestore. Firestore e tráfego de hospedagem podem ter cobrança própria; “sem API paga” não significa infraestrutura universalmente gratuita.

### Etapa 2: paga e bloqueada por padrão

Só inicia se faltam qualificados, há token, configuração de orçamento consistente e armazenamento persistente funcional. Chaves sozinhas não autorizam gasto. Não há pressuposto de saldo gratuito.

O Firestore usa `_blitzRadarExecutions` e `_blitzRadarBudget`, coleções privadas separadas de `users/*/contacts`. A conta de serviço é lida de `BLITZ_FIREBASE_SERVICE_ACCOUNT` no servidor. O login e `verifyIdToken` continuam intactos. As regras existentes negam acesso direto do cliente às novas coleções; Admin utiliza IAM. Não é necessário abrir essas coleções ao navegador.

Uma transação reserva o pior caso: `máximo de Actors × teto por Actor + máximo de consultas Serper × estimativa configurada por consulta`. Rejeita teto diário monetário, limite diário de consultas, concorrência de execuções/Actors e execução duplicada. O dia usa America/Sao_Paulo. Preview e Production que usam o mesmo banco compartilham o ledger, para não duplicar o orçamento. Reservas não são devolvidas automaticamente em erro/timeout: uma cobrança pode ter ocorrido. Custo do fornecedor é exibido separadamente da reserva. Se um início não confirmar run ID ou um poll falhar sem confirmar status terminal do Actor, os slots permanecem reservados conservadoramente até a expiração; isso evita liberar concorrência de um run que pode continuar ativo.

Serper: consultas exatas no relatório, contagem de links recebidos e créditos quando retornados. Saldo é “não verificado”; não há endpoint de carteira integrado/documentado neste projeto. O valor `BLITZ_SERPER_QUERY_USD` é uma estimativa conservadora do operador conforme seu plano, não um preço consultado. O limite de quantidade é efetivamente imposto pelo código.

Apify: consulta `GET /v2/users/me/limits`. Mostra disponibilidade do limite mensal quando disponível, nunca chama isso de saldo de créditos. Consulta a metadata de preço de cada Actor e só inicia modelo `PAY_PER_EVENT`, no qual utiliza `maxTotalChargeUsd`. Modelos ausentes/diferentes ficam bloqueados: não promete teto financeiro num Actor com cobrança que não possa comprovar. Actors têm timeout de 240 segundos e limite de itens. Preços mínimos e permissões podem impedir uma execução; aparecem no relatório. `usageTotalUsd` do run é custo informado, quando presente.

Fila: deduplica URLs exatas por plataforma e pode executar várias origens da mesma rede. Até cinco runs por busca, conforme configuração; o excedente não é silencioso, aparece como limitado. A fila não continua pagando em outra busca automaticamente. Até duas páginas de 100 linhas por dataset; corte e total informado nos headers aparecem como cobertura parcial. URLs adicionais e páginas fora desse teto exigem uma execução direcionada/manual com nova reserva. Inicialização de runs sequencial; total de Actors simultâneos é reservado globalmente. Cliques repetidos reaproveitam Promise local, reserva e resposta persistente; a interface também bloqueia submissão simultânea.

### Relatório e classificação

Por fonte: consultada/não consultada, consulta/URL, recebidos, normalizados quando aplicável, qualificados, descartes por produto/vendedor/intenção/região/duplicidade/data/autor/fonte, erros, limites, cache, reserva, custo informado, run ID e páginas. Resumo estruturado `blitz-radar-execution` é registrado nos Runtime Logs com consultas, contagens, descartes, falhas e custos (sem nomes/contatos de pessoas ou tokens). Relatório pago persiste no Firestore junto da execução. No modo exclusivamente público, o relatório fica na resposta e interface; não há persistência entre cold starts sem banco.

Estado de processamento (`done`) é diferente de cobertura: completa nas fontes consultadas, parcial, indisponível ou sem correspondências. Falhas essenciais e cortes não viram “coleta concluída”. Zero não comprova ausência de compradores.

Expressões: quero comprar/adquirir, onde compro/encontro, preciso de, procuro/busco, alguém indica/vende, quem vende e solicitação explícita de orçamento. Termos do produto devem estar próximos da intenção; ofertas, negações e compras concluídas são excluídas. Sinônimos conservadores para refrigerador/geladeira, tintas impermeabilizantes e ração para cães; sem inventar nicho alternativo. Não interpreta likes, seguidores, reviews ou pertencimento a grupo como intenção.

Separação geográfica: declaração do autor, local mencionado no pedido e contexto do grupo. Declaração de entrega indica destino, não residência. Sem comprovação regional, há seção separada; esses registros não contam nem são salvos automaticamente como compradores da cidade. Telefone/email só vêm de oferta explícita do próprio autor naquele texto; nenhum cruzamento de identidade.

### B2B: empresa, QSA e profissionais

Google Places continua a fornecer estabelecimento e contatos gerais publicados. BrasilAPI/Casa dos Dados consultam CNPJ exato; QSA fica como sócios/administradores, não compradores. Nenhuma busca por coincidência de nome.

Nos até três sites oficiais vinculados considerados, o coletor lê a home e até duas páginas de contato/equipe/sobre/compras. Só aceita o site que menciona o nome comercial. JSON-LD `Organization.employee` ou `Person.worksFor` precisa declarar o vínculo com a empresa exata. Nome/cargo profissional são separados do QSA. Telefone/email são atribuídos à pessoa somente no mesmo objeto profissional; contatos gerais ficam rotulados “contato da empresa”. Cada campo tem URL, trecho JSON-LD, data e situação. libphonenumber-js normaliza E.164 e valida estrutura; atividade, WhatsApp, titularidade e autoridade de compra permanecem não comprovados.

Documentos PDF e perfis profissionais externos não têm coletor implementado. Páginas institucionais HTML estruturadas são suportadas. Não foi adicionado scraping de LinkedIn nem busca de pessoa por username. Ausência de JSON-LD profissional é ausência de nome/cargo, não motivo para inferir decisor.

## Configuração externa necessária

Todos os valores abaixo são apenas nomes; não envie segredos pelo chat/GitHub e não use prefixo VITE_.

| Variável | Finalidade |
|---|---|
| BLITZ_PUBLIC_ALLOWED_HOSTS | Hosts exatos onde leitura pública foi autorizada |
| BLITZ_PUBLIC_SOCIAL_URLS | URLs públicas opcionais, separadas por vírgula |
| BLITZ_RADAR_CACHE_SECONDS | 60–3600 segundos; padrão 900 |
| BLITZ_RADAR_MAX_AGE_DAYS | Janela de publicações 1–365 dias; padrão 30; sem data fica aviso |
| BLITZ_FIREBASE_SERVICE_ACCOUNT | JSON da conta de serviço, acesso IAM ao banco já usado, somente servidor |
| BLITZ_RADAR_SEARCH_USD / BLITZ_RADAR_DAILY_USD | Tetos por busca/dia; ausentes bloqueiam gasto |
| BLITZ_APIFY_MAX_USD_PER_RUN | Teto de cada Actor, limitado a US$ 2 pelo código |
| BLITZ_SERPER_QUERY_USD | Estimativa conservadora por consulta do plano do operador |
| BLITZ_RADAR_SERPER_QUERIES / BLITZ_RADAR_DAILY_SERPER_QUERIES | Máximo 6 por busca / máximo 100 diário |
| BLITZ_RADAR_MAX_ACTORS | Até 5 por busca |
| BLITZ_RADAR_CONCURRENCY | Até 3 execuções simultâneas |
| BLITZ_RADAR_ACTOR_CONCURRENCY | Até 10 Actors simultâneos globais; deve comportar máximo por busca |
| SERPER_API_KEY / APIFY_API_TOKEN | Provedores pagos, saldo/permissões próprios |
| GOOGLE_MAPS_API_KEY | Places API New, faturamento e quota, B2B |
| CASA_DOS_DADOS_API_KEY | Cadastro empresarial opcional, não intenção |
| BLITZ_ALLOWED_UIDS | Contas Firebase autorizadas, opcional |

Configure TTL/limpeza administrativa das execuções expiradas no Firestore: `expiresAt` em milissegundos é verificado pelo aplicativo, mas não ativa sozinho o TTL nativo do Firestore (que exige Timestamp). O ledger diário conserva reserva por dia; planeje retenção administrativa. Não se faz remoção automática dos contatos existentes.

A rotina HTTP, fila limitada, normalização, relatório e funções Node funcionam no modelo serverless da Vercel. O controle persistente necessita conta de serviço/IAM. Navegadores e Python não foram integrados; nenhum worker externo é apresentado como funcional.

## Roteiro manual para a próxima execução real

1. Confirme commit do PR na prévia; login Firebase e registros existentes devem continuar disponíveis. Não faça merge.
2. Primeiro mantenha orçamento vazio: B2C `ração para cão`, `Paracatu, MG`, 4 contatos, sem URLs. Deve mostrar fontes não consultadas/etapa paga bloqueada, links manuais e nenhuma cobrança.
3. Encontre uma publicação realmente pública com texto, autor e região e permissão de leitura. Adicione a URL e autorize somente o host. Confira o texto/autor/URL/data originais; não use fixtures de testes na aplicação. HTML sem autor não deve criar comprador. Uma publicação sem região deve ficar na seção separada.
4. Repita com cache: data da coleta/validade ficam visíveis. Clique repetidamente: não deve iniciar múltiplos runs.
5. Configure banco, orçamento, limites, chaves e Actors PAY_PER_EVENT em Preview. Reexecute poucas origens. Compare cada consulta Serper, run ID, quantidade do dataset, custos e descartes com o painel Apify. Force limite pequeno/bloqueio e confirme estado parcial/indisponível. Confira ledger global e ausência de duplicação.
6. Para B2B: `lojas de tintas`, `Uberlândia, MG`, 4. Verifique evidências de empresa/telefone geral/site. Se JSON-LD da equipe existir, confirme nome/cargo e vínculo profissional no mesmo trecho. Consulte um CNPJ real e confira QSA separado. Telefone estruturalmente válido nunca deve virar “ativo” ou “WhatsApp confirmado”.
7. Confira DevTools: POST `/api/deep-search`, `/api/b2c-multifactor-search` e polls `/api/social-radar`, status e Content-Type JSON. Runtime Logs não devem conter ERR_REQUIRE_ESM. Preserve relatório real e JSON (removendo tokens), para verificar a próxima busca sem reconstruir números.

Os testes automatizados usam fontes simuladas. Não há nesta revisão evidência de coleta real autenticada na prévia: este ambiente não tem tokens de fontes nem sessão do usuário, e o proxy bloqueia o domínio da prévia. A próxima busca real e configuração de IAM/ledger necessitam ação do operador. Consultar documentação de bibliotecas é pesquisa real de documentação, não prova de coleta de compradores.

Referências oficiais: [Apify limites](https://docs.apify.com/api/v2/users-me-limits-get), [ActorStartOptions](https://docs.apify.com/api/client/js/reference/interface/ActorStartOptions), [metadados do Actor](https://docs.apify.com/api/v2/act-get).
