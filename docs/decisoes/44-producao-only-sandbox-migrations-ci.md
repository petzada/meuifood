# Decisão: só produção + sandbox gateways + migrations no CI

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #J  
**Depende de:** [25](25-hospedagem-ci-ops.md) · **Contraponto resolvido** vs staging completo

## Decisão

| Item | MVP |
| --- | --- |
| Ambiente Railway | **Só produção** — sem staging / preview |
| Gateways | **Sandbox / test mode** Woovi e Asaas para desenvolver e validar cobrança/estorno |
| Loja `is_demo` | **Não** — evita complexidade extra; risco aceito com CI + sandbox |
| Deploy | PR → **GitHub Actions** verde → deploy produção ([25](25-hospedagem-ci-ops.md)) |
| Migrations Prisma | **Validar no GH Actions** (ex.: `prisma migrate diff` / deploy dry-check / test apply em DB de CI se viável) antes de aplicar em prod — objetivo: falhar no CI, não no banco de produção |

## Motivo

Founder solo + piloto pequeno: staging duplica ops. Sandbox dos PSPs cobre o caminho crítico de pagamento; CI reduz regressão de schema. Sem `is_demo` a menos que dor futura prove o contrário.

## Rejeitado nesta rodada

- Staging Railway completo no MVP.  
- Loja `is_demo` como mitigação obrigatória.
