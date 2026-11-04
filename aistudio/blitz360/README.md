# Blitz 360

Prospecção por Google Maps via Apify, carteira comercial e propostas revisáveis.

## Fluxo operacional

1. Entrar com Google/Firebase.
2. Informar produto (contexto), segmento comprador (busca Maps), cidade/UF ou Brasil, quantidade de 1 a 20 e limite monetário em USD.
3. Iniciar, acompanhar ou cancelar a execução real. O início tem identificador idempotente; um resultado incerto não é repetido automaticamente.
4. Revisar nome, telefone publicado, endereço e URL de origem. Ausência de telefone permanece vazia. Maps não comprova intenção de compra, WhatsApp ou decisor.
5. Salvar na carteira; duplicidades normalizadas preservam etapa, notas, valor, próxima ação e histórico.
6. Registrar explicitamente a abordagem realizada. Abertura de WhatsApp não confirma envio.
7. Criar rascunho de proposta; revisar condições antes de enviar. Custos e margens não entram no texto externo.

## Configuração do servidor

- APIFY_TOKEN: segredo do servidor, nunca no navegador nem na URL.
- APIFY_MAX_RUN_USD: teto por coleta, padrão USD 0,50, máximo de configuração USD 2,00.
- APIFY_DAILY_BUDGET_USD: reserva diária por usuário, padrão USD 5,00, máximo de configuração USD 20,00. Reservas são conservadoras; não representam a fatura real do Apify.
- Firebase Admin: Application Default Credentials da conta de serviço do servidor, com acesso ao projeto e banco definidos em firebase-applet-config.json. Em ambiente externo use a identidade/credencial de serviço adequada; nunca inclua arquivo de chave no frontend ou em commits.
- PORT: porta do processo (padrão 3000).

Sem token retorna APIFY_NOT_CONFIGURED/503 e zero leads. Sem acesso administrativo ao Firestore a operação falha; não reduzimos as regras para contornar credenciais ausentes. Início ambíguo mantém orçamento e slot reservados e requer conferência no console Apify antes de reconciliação administrativa.

Actor permitido: compass/crawler-google-places. Parâmetros de entrada: searchStringsArray, locationQuery, maxCrawledPlacesPerSearch, language. maxTotalChargeUsd, timeout e maxItems são parâmetros da URL de início. Token só em Authorization Bearer.

Redes sociais, PNCP, OSINT e enriquecimentos antigos não integram a versão ativa. A interface os identifica como pendentes. Esta cópia isolada não inclui coletores legados nem alternativas de resultados sintéticos.

## Dados e segurança

Contatos existentes permanecem em users/{uid}/contacts. Operações de sistema estão em blitz_server_v2_users/{uid}, fora das regras antigas dos clientes. Autorização é feita pelo UID verificado, nunca por UID recebido no corpo. Aplique firestore.rules pelo fluxo de implantação do Firebase; manter o arquivo no projeto não comprova publicação das regras.

Limpar consultas anteriores arquiva contatos ativos e consultas concluídas em lote restaurável e remove caches locais específicos. Documentos antigos sem archived também entram. Histórico de interações é preservado. Coletas em andamento são contabilizadas e não são removidas do histórico. Lotes interrompidos podem ser retomados; restauração não apaga dados. A operação não limpa o chat de desenvolvimento.

## Desenvolvimento e testes

```sh
npm install
npm run dev
npm run lint
npm test
npm run build
npm start
```

Build: frontend em dist/public, servidor ESM em dist/server.js. Reinicie o processo de desenvolvimento após alterações no backend; o modo watch do Node não deve ser usado no preview do AI Studio. Os testes não usam credenciais reais nem chamadas Apify externas. Testes locais não substituem validação no ambiente autenticado com Firebase e uma coleta real dentro do orçamento autorizado.
