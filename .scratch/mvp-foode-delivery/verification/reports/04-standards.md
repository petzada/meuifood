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
Nova CI e evidências finais devem ser anexadas após o push corretivo.
