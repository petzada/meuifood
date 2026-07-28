# Domain Docs

Este repositório usa um único contexto de domínio.

## Ordem de leitura

Antes de explorar, especificar ou implementar:

1. Leia `CONTEXT.md` para o glossário e a linguagem ubíqua.
2. Consulte `docs/README.md` para o índice e o status.
3. Leia as decisões relevantes em `docs/decisoes/`.
4. Leia os ADRs técnicos relevantes em `docs/adr/`.
5. Para UI, use `docs/FOODE-BRAND.md`; `docs/DESIGN.md` fornece somente densidade e spacing.

## Autoridade

- `CONTEXT.md` define o vocabulário usado em specs, tickets, código e testes.
- `docs/decisoes/` contém decisões fechadas de produto e stack.
- `docs/adr/` contém decisões técnicas load-bearing.
- `docs/pesquisa/` contém benchmarks e não deve ser tratada como decisão.
- Decisões superseded não devem orientar novas implementações.
- Conflitos com decisões ou ADRs devem ser apresentados explicitamente, nunca sobrescritos silenciosamente.

## Estrutura

Não criar `CONTEXT-MAP.md`, glossários adicionais ou diretórios de ADR por app. O contexto permanece centralizado em:

- `CONTEXT.md`
- `docs/decisoes/`
- `docs/adr/`
