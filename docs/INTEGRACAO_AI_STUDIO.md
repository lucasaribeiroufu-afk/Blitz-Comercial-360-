# Consolidação do Blitz 360 no GitHub

A versão testada no Google AI Studio está em `aistudio/blitz360/`. É uma aplicação independente nesta branch; as entradas, APIs, worker e configuração Vercel da raiz foram preservados.

## Estado comprovado

- Frontend/backend compilados e 18 testes locais aprovados.
- Coleta Maps por actor Apify permitido, autenticação Firebase, execução assíncrona, cancelamento e reserva de orçamento por UID.
- CRM com deduplicação, etapas, histórico explícito, propostas sem custos internos e limpeza/restauro por lote.
- Fontes sociais e PNCP desta cópia são identificadas como pendentes.
- Coleta real com APIFY_TOKEN e limpeza da carteira autenticada ainda não foram executadas.

## Escopo comercial

Empresa encontrada no Maps é prospect compatível; não comprova cliente ativo nem comprador interessado agora. Demanda atual requer fonte, data da publicação, trecho do pedido, produto, região e situação da solicitação. Captura recente não transforma publicação antiga em demanda recente. Etapa comercial depende de retorno registrado pelo vendedor.

A raiz já contém radar social, fontes públicas, endpoints serverless e worker. Código existente não comprova implantação, configuração ou geração de oportunidades válidas.

## Integração pendente

1. Comparar socialRadar.js, buyerRadar.js, purchaseIntent.js, radarStore.js, worker/ e testes da raiz com os contratos desta cópia. Preservar módulos úteis e conectar sinais documentados ao CRM; não reativar geradores.
2. Definir a entrada de produção. A Vercel da raiz usa dist/; esta cópia gera dist/public/ e servidor ESM dist/server.js. Conciliar isso antes de alterar a implantação.
3. Configurar APIFY_TOKEN e identidade de serviço Firebase no host do backend. Não publicar tokens, chaves administrativas ou dados da carteira no GitHub. O JSON Firebase incluído é configuração pública do cliente, já existente no projeto.
4. Validar coleta pequena com teto monetário explicitamente autorizado e conferir fonte, data, nicho e região.
5. Confirmar login, inventariar dados e executar arquivo reversível com contagens e restauro conferidos.
6. Implantar worker/agendamento para monitoramento contínuo, com deduplicação e alertas. GitHub mantém código e verificações; a coleta precisa de um servidor em operação.

## Verificação isolada

```sh
cd aistudio/blitz360
npm ci
npm run lint
npm test
npm run build
```

O workflow aistudio-validation.yml verifica somente esta cópia, sem secrets nem chamadas Apify reais. Esta branch não implica deploy, fusão no main ou comprovação de intenção de compra em tempo real.
