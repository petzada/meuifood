# Ticket 06 — revisão de padrões

**Base:** `8878bd1`  
**Branch:** `cursor/complementos-adicionais-carrinho-391f`  
**Status:** aprovado para revisão após correções

## Fontes

- `AGENTS.md`, `CONTEXT.md`
- `docs/agents/domain.md`
- `docs/FOODE-BRAND.md`
- Decisões 13, 36, 38 e 55
- Skills TDD e design frontend

## Resultado

Nenhuma violação dura encontrada. A migration mantém `store_id`, FKs compostas,
RLS forçada e grants para `foode_business`; as rotas de configuração exigem
Dono; a UI preserva Primary Foode, Nunito, containers outline e ausência de
shadow.

## Achados e resolução

1. **Procedente — IDs canônicos de opções:** o primeiro diff removia e recriava
   todas as opções ao salvar um grupo. Corrigido para preservar IDs de opções
   semanticamente iguais, atualizar a ordem e criar/remover somente diferenças.
   A prova HTTP agora compara os IDs antes e depois de um save sem mudança.
2. **Não aplicável — duplicação de helpers de preço no Admin:** os helpers são
   pequenos, locais a módulos próprios do Ticket 06 e extraí-los agora ampliaria
   arquivos compartilhados e conflito com o Ticket 07. Lint e tipos cobrem o
   contrato; não há divergência monetária, pois os cálculos persistidos usam
   centavos inteiros.
3. **Não aplicável — painel filtra customizações por item:** a filtragem é a
   fronteira de apresentação do componente e evita alterar a estrutura do
   Cardápio entregue pelo Ticket 05.

## Verificações locais

- `pnpm lint`: passou
- `pnpm typecheck`: passou
- `pnpm test:quality`: passou
- `pnpm build`: passou
- `pnpm --filter @foode/db migrations:validate`: passou

O shell local usa Node 22 e emitiu warning de engine (`>=24`), sem falha. O CI
usa o runtime canônico.

## Revalidação

Após as correções, a revisão Standards foi repetida no diff completo e retornou
`PASS`, sem regressões acionáveis.

O workflow `30405455056` da PR #14 também passou nos jobs `quality`, `migrate`
e `integration` no commit `054454e`.
