# Ticket 03 - revisão de especificação

**Base fixa:** `origin/master` em `a5c99af`

## Resultado

### 1. Onboarding do Dono parcial

**Classificação:** procedente, severidade alta.

Foi adicionado o comando versionado `provision:owner`. Ele recebe Loja e e-mail,
convida a identidade pelo Supabase Auth, persiste a membership `owner` com uma
conexão administrativa consciente e revoga o usuário convidado caso a persistência
falhe. O README registra execução e variáveis; `DATABASE_URL` não entra no runtime
Railway da API. Testes cobrem sucesso e rollback.

### 2. Gestão de Equipe parcial no Painel

**Classificação:** procedente, severidade média.

O Painel do Dono agora consulta membros, mostra e-mail/papel, convida Operadores e
remove seu acesso por Server Actions autenticadas. O Operador não recebe navegação
nem conteúdo de Equipe. A tela preserva Nunito, primary `#F35050`, containers
outline sem sombra, responsividade, foco visível e estados de loading, vazio, erro
e sucesso. A API continua sendo a autoridade do RBAC.

### 3. Unicidade global de `store_members.user_id`

**Classificação:** procedente, severidade média.

As decisões 20, 36 e 38 não definem exclusividade global da identidade entre
Lojas. A nova migration remove somente o índice único adicionado pelo Ticket 03.
Enquanto não houver seleção explícita de Loja, a resolução consulta no máximo duas
memberships e falha fechado quando encontra zero ou mais de uma. Um teste HTTP
remoto cobre a ambiguidade. Não foi necessário criar ADR ou alterar o modelo de
domínio canônico.

## Notas herdadas do Ticket 02

- Assunção obrigatória de `foode_business`: resolvida.
- Rejeição de login privilegiado no startup: resolvida.

## Conclusão

Todos os achados procedentes foram corrigidos. A exceção mínima de CI permanece
limitada ao DAG autorizado neste ticket; nenhum outro requisito do Ticket 04 foi
implementado.
