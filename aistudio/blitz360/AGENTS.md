# Blitz 360 — regras de implementação

- Entradas de produção: src/main.tsx e server.ts. A interface ativa está em src/App.tsx; servidor ativo em src/server/{apify,crm,repository}.ts.
- Arquivos legados não importados pelos pontos de entrada não são coletores disponíveis e não podem ser reativados sem revisão. Nunca importar realVerifiedDatabase, socialKnowledgeBase, geradores de nomes, CNPJ, telefone, e-mail, demanda ou preços.
- Buscas retornam dados de coleta real com nome e URL de origem; ausência de integração ou de evidência resulta em erro explícito ou zero resultados. Nunca preencher com empresas de outro nicho.
- Produto é contexto comercial; segmento comprador é a consulta Maps; Brasil permanece um país. Empresa localizada não significa comprador ativo, sócio não significa decisor, formato telefônico não confirma WhatsApp.
- Toda API operacional exige Firebase ID token validado no servidor. APIFY_TOKEN e credenciais de serviço só no ambiente do servidor. Não remover autenticação para resolver erro de login.
- Runs, reservas de custo, aliases e lotes estão na coleção protegida blitz_server_v2_users; dados legados de contatos continuam em users/{uid}/contacts. Nunca permitir escrita de clientes nos documentos operacionais.
- Custos são limitados na URL da API Apify. Não repetir automaticamente POST de início. Falha ambígua conserva reserva até reconciliação. Propriedade por UID, liberação atômica e idempotente de slots são obrigatórias.
- Nenhuma coleta paga sem teto informado pelo operador. Nenhuma chamada externa real nos testes unitários.
- Limpeza é arquivo lógico reversível por conta e por lote, incluindo registros legados sem archived, com retomada após falhas. Não excluir permanentemente nem alterar dados de outros usuários.
- Abrir WhatsApp ou copiar proposta não registra interação. O operador registra canal e resumo após a abordagem.
- Propostas externas excluem custos internos e margens. Nunca prometer laudos, garantias, descontos, urgência ou documentação sem confirmação. Contribuição estimada não é lucro líquido; markup é diferente de margem.
- Antes de aplicar alterações: npm run lint, npm test, npm run build. Os testes usam repositório e transporte isolados; nenhuma configuração HTTP deve habilitar mocks de produção.
