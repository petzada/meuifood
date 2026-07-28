# Ticket 04 — Review de Standards

**Fixed point:** `origin/master` (`2ad21b72fb9831fe05d67aa7a87d8074cc36e4ac`)

**Diff:** `git diff origin/master...HEAD`

**Review:** subagente independente, eixo Standards

## Achados originais

1. **Alta — violação dura:** a política inicial usava uma denylist de quatro
   regexes e aceitava, por exemplo, `DROP SCHEMA public CASCADE`, contrariando a
   Decisão 55.
2. **Baixa — julgamento, Duplicated Code:** descoberta, ordenação e parsing das
   migrations Prisma estavam repetidos em três scripts e já divergiam quanto a
   diretórios inválidos.

## Classificação e resolução

1. **Procedente — corrigido.** A política passou a usar allowlist estrutural e
   falha fechado para qualquer `DROP` fora de `DROP INDEX`, `DELETE`, `TRUNCATE`,
   bypass/desativação de RLS, `SUPERUSER`, SQL dinâmico e controle transacional.
   O preflight adicional executa o SQL pendente dentro de transação real no
   Supabase e força rollback. Testes negativos cobrem `DROP SCHEMA ... CASCADE`,
   `DROP TYPE`, `DROP OWNED`, constraint, disable/no-force RLS,
   `BYPASSRLS`/`SUPERUSER`, escape transacional, `VACUUM`, `ALTER SYSTEM`,
   `CREATE DATABASE` e `EXECUTE`.
2. **Procedente — corrigido.** `canonical-migrations.mjs` tornou-se a única
   descoberta de nome, versão, ordem e conteúdo usada por validação, projeção e
   verificação remota; diretório inválido agora falha em todos os consumidores.

## Achado adicional da execução

- **Procedente — corrigido.** O run `30380168302` emitiu warning de runtime
  Node 20 depreciado nas Actions v4. As três instâncias de `checkout`,
  `setup-node` e `pnpm/action-setup` foram atualizadas para v6, conforme a
  documentação oficial corrente.

## Resultado

Dois achados do revisor e um achado de execução, todos procedentes e corrigidos.
O push corretivo `0182b05` foi validado pelo run `30382305139`: `quality`,
`migrate` e `integration` concluíram verdes. A suíte determinística de banco
passou 30/30 e a API passou 25/25. O job de migrations validou as quatro
migrations canônicas antes de tocar produção e não emitiu o warning de runtime
Node 20 observado no run inicial.

## Releitura corretiva

1. **Alta — procedente e corrigido.** O revisor demonstrou que a primeira
   correção ainda aceitava `DO $$ BEGIN PERFORM purge_business_data(); END $$`.
   O teste foi reproduzido vermelho; a política agora aceita somente o bloco
   canônico que cria `foode_business` com `NOLOGIN`, `NOSUPERUSER`,
   `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT` e `NOBYPASSRLS`. `PERFORM`, `CALL`,
   `UPDATE`, corpo em literal e SQL dinâmico dentro de `DO` falham fechado. A
   suíte de banco passou 35/35 após a correção.
2. **Baixa — procedente e corrigido.** A montagem da URL de produção e leitura
   segura das credenciais foi centralizada em `production-database-url.mjs`,
   compartilhada pelo preflight da API e pelo verificador independente.

Após a releitura, não há achado de Standards aberto. Lint, typecheck,
`test:quality`, build, preflight transacional real e verificação independente
passaram; o preflight e o verificador encontraram zero resíduos.
