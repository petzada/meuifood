# Decisão: exceção temporária — `master` sem branch protection

**Data:** jul/2026 · **Status:** decidido · **Sessão:** implementação ticket 04
**Depende de:** [55](55-migrations-supabase-producao-ci.md) · [44](44-producao-only-sandbox-migrations-ci.md) · [25](25-hospedagem-ci-ops.md)

## Contexto

A decisão [55](55-migrations-supabase-producao-ci.md) exige que nada seja aplicado no banco de
produção sem CI verde. A forma canônica de tornar isso obrigatório no GitHub é branch protection
ou ruleset — ambos indisponíveis no plano atual para repositório privado (a API responde
**HTTP 403**).

## Decisão

- **Não** haverá upgrade para GitHub Pro/Team neste momento.
- A exigência de gate no `master` fica **autorizada formalmente como exceção temporária**: ela é
  convenção operacional, não mecanismo imposto pela plataforma.
- Toda mudança entra por **Pull Request** com os três jobs verdes. Push direto em `master` é
  exceção consciente do founder, não caminho normal.

## O que a exceção não coloca em risco

Migration **não** é aplicada com CI vermelho, e isso não depende de branch protection: o job
`migrate` declara `needs: quality`, e o workflow roda igual em push direto e em PR. Um push com
qualidade vermelha nunca alcança o job que aplica migration.

Somam-se a isso duas travas que vivem no repositório, não no GitHub: a política de migration
**fail-closed** com allowlist estrutural e o **preflight transacional com rollback**, ambos do
ticket 04.

## O que a exceção realmente expõe

Um push direto não revisado pode alterar **o próprio `.github/workflows/ci.yml`** — por exemplo
removendo `needs: quality` — no mesmo commit de uma migration ruim. É exatamente isso que branch
protection impediria, e é o risco aceito aqui.

Mitigação enquanto a exceção durar: **mudança em `.github/workflows/ci.yml` exige revisão
explícita por PR**, sem push direto, mesmo quando parece trivial.

## Gatilho de reabertura

Esta decisão é revista, e a proteção passa a ser obrigatória, quando **qualquer** um ocorrer:

- o repositório se tornar público (branch protection passa a estar disponível de graça);
- o plano for atualizado para Pro/Team por outro motivo;
- uma segunda pessoa ganhar acesso de escrita ao repositório.

O terceiro gatilho é o mais importante: a exceção se sustenta em disciplina de um único operador.

## Rejeitado

- Upgrade para Pro/Team apenas para obter branch protection no piloto.
- Tornar o repositório público apenas para destravar a proteção.
- Tratar a ausência de proteção como equivalente a proteção configurada.
