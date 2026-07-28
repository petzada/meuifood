# Issue tracker: Local Markdown

Specs e tickets deste repositório vivem em `.scratch/`.

## Feature ativa

- Slug: `mvp-foode-delivery`
- Diretório: `.scratch/mvp-foode-delivery/`
- Spec: `.scratch/mvp-foode-delivery/spec.md`
- Tickets: `.scratch/mvp-foode-delivery/issues/<NN>-<slug>.md`

## Convenções

- Uma feature por diretório.
- Um arquivo por ticket, numerado a partir de `01`.
- Tickets são numerados em ordem blockers-first.
- Dependências são registradas em uma linha `Blocked by:`.
- O estado é registrado em uma linha `Status:` próxima ao início do arquivo.
- Specs e tickets publicados para implementação usam `Status: ready-for-agent`.
- Comentários e histórico são acrescentados ao final sob `## Comments`.

## Publicação

Quando uma skill pedir para publicar no issue tracker, ela deve criar o arquivo correspondente em `.scratch/mvp-foode-delivery/`.

## Leitura de tickets

Quando uma skill pedir o ticket relevante, ela deve ler o caminho ou número informado dentro de `.scratch/mvp-foode-delivery/issues/`.
