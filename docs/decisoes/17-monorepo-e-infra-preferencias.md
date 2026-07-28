# Decisão: monorepo + âncora de infra

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #1 (revisado)  
**Pesquisa:** [13 síntese](../pesquisa/13-sintese-stack-mvp.md)

## Decisão

### Repositório

- **Monorepo desde o dia 1** (não multi-repo no MVP).
- Motivo do founder: melhor fluxo com agentes de código + deploy; arquitetura limpa pensando em escala Brasil se o MVP regional validar.

### Apps no monorepo (revisão)

**Não** juntar storefront + painel + API num único deploy Next.

| App / serviço | Papel | Por quê separado |
| --- | --- | --- |
| **`web`** | Storefront público `/loja/[slug]` (Next) | Tráfego, cache/SSR e superfície de segurança diferentes do admin |
| **`admin`** | Painel lojista (Next) | Auth/roles, não precisa de SEO; escala de uso ≠ cardápio |
| **`api`** | API + webhooks + jobs/workers (serviço Node na Railway) | Pagamentos, idempotência, reconciliação e filas cabem melhor fora do ciclo de request do Next |
| **worker** (quando doer) | Filas/reconciliação dedicadas | Pode começar **no mesmo processo da `api`**; extrair serviço Railway depois sem trocar de repo |

Ferramenta de monorepo (pnpm workspaces / Turborepo / etc.) = detalhe no grilling de pastas — o contrato é: **packages compartilhados** (`db`, `shared`/tipos, eventualmente `ui`).

### Âncora de hospedagem / dados (preferência do founder)

| Camada | Preferência | Nota |
| --- | --- | --- |
| Apps, workers, filas | **Railway** | Já usa plano ~US$ 5 (outros projetos); Foode entra nesse ecossistema |
| Banco | **Supabase (Postgres)** | Intenção de plano ~US$ 20 (conexão a +2 projetos) |
| Redis / cache | **Só se dor medida** | Não é default do MVP — ver [25](25-hospedagem-ci-ops.md) |

Isso **desloca** o default da síntese (Vercel + Postgres genérico) para **Railway + Supabase**. Detalhe de CI/DNS/ops: [25](25-hospedagem-ci-ops.md).
## Trade-off aceito

- Mais de um serviço para deployar no MVP (vs 1 Next monolítico) → ganho em limites claros e caminho a escala nacional sem reescrever fronteiras.
- Solo founder: compartilhar tipos/DB no monorepo evita drift; **não** microsserviços de domínio no dia 1 (só fronteiras web / admin / api).

## Explicitamente adiado

- Detalhe fino de pastas (`apps/web`, `packages/*`) — **fechado** em [26](26-estrutura-monorepo.md).
- Confirmar se marketing site institucional vive no mesmo app web ou página estática à parte — **fechado** em [40](40-marketing-no-apps-web.md) (mesmo `apps/web`).
- Fechamento fino de CI/secrets — **fechado** em [25](25-hospedagem-ci-ops.md).
- Extrair worker como 4º serviço Railway — só com dor real (timeout, fila, carga).
## Rejeitado

- Multi-repo no MVP.
- Um único app Next com storefront + painel + webhooks críticos no mesmo deploy como arquitetura-alvo.
- Assumir Vercel como host padrão do Foode.
