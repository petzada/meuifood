# Verificação automática — mvp-foode-delivery

_Atualizado em 2026-11-05T06:27:55.317Z · branch `feat/25-legado-391f` · HEAD `d22512d9`_

Relatórios gerados pelo loop de verificação (orquestrador Opus + verificadores Sonnet).
Cada relatório confronta a implementação com `spec.md`, o ticket, `docs/decisoes/` e `docs/adr/`.

- Tickets: **31** · sinalizados como concluídos: **22**
- Conformes: **4** · com divergências: **0** · na fila: **18**
- Bloqueadores abertos: **0**

| # | Ticket | Impl. | Veredito | Abertos | Bloq. | Verificado em | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Bootstrapar monorepo e identidade Foode | sim | ✅ conforme | 0 | 0 | 2026-07-28 18:34 | [relatório](reports/01-bootstrap-monorepo-identidade-foode.md) |
| 02 | Instalar Loja, `store_id` e RLS efetiva | sim | ✅ conforme | 0 | 0 | 2026-07-28 18:34 | [relatório](reports/02-loja-store-id-rls.md) |
| 03 | Autenticar Dono e Operador e aplicar RBAC | sim | ✅ conforme | 0 | 0 | 2026-07-28 18:34 | [relatório](reports/03-auth-rbac-dono-operador.md) |
| 04 | Bloquear produção com CI e migrations validadas | sim | ✅ conforme | 0 | 0 | 2026-07-28 19:25 | [relatório](reports/04-ci-migrations-producao.md) |
| 05 | Gerenciar e publicar o Cardápio da Loja | sim | — | — | — | — | — |
| 06 | Configurar Complementos e montar o carrinho | sim | — | — | — | — | — |
| 07 | Aplicar horários e Pausa no Canal próprio | sim | — | — | — | — | — |
| 08 | Concluir o primeiro Pedido Guest na Retirada | sim | — | — | — | — | — |
| 09 | Adicionar Delivery por Taxa fixa ou bairro | sim | — | — | — | — | — |
| 10 | Pagar por PIX Woovi em `pilot_platform` | sim | — | — | — | — | — |
| 11 | Pagar por Crédito Asaas em `pilot_platform` | sim | — | — | — | — | — |
| 12 | Cancelar Pedido e executar Estorno automático | não | — | — | — | — | — |
| 13 | Conta do Consumidor, Cupom de boas-vindas e Cupons promocionais | não | — | — | — | — | — |
| 14 | Plano e faixa no Painel, relatórios, Repasses e lotes diários | não | — | — | — | — | — |
| 15 | Reconciliar pagamentos e repasses por Cron Triggers | não | — | — | — | — | — |
| 16 | Futuro: onboarding assistido de subconta `baas` | sim | — | — | — | — | — |
| 17 | Endurecer os portões de verificação do banco e do CI | sim | — | — | — | — | — |
| 18 | Instalar os seams compartilhados antes que as cópias se multipliquem | sim | — | — | — | — | — |
| 19 | Aprofundar os modules da API e do acesso a dados | sim | — | — | — | — | — |
| 20 | Aprofundar contratos e modules do Storefront e do Painel | sim | — | — | — | — | — |
| 21 | Fundar a stack Cloudflare: Workers, D1, CI/CD e contas | sim | — | — | — | — | — |
| 22 | Auth multi-Loja com Better Auth, RBAC e e-mail | sim | — | — | — | — | — |
| 23 | Portar Cardápio, Complementos e imagens para a stack nova | sim | — | — | — | — | — |
| 24 | Portar horários, Pausa, Pedido Guest, Delivery e impressão | sim | — | — | — | — | — |
| 25 | Domínios, e-mail e remoção do legado (Supabase, Railway, Woovi) | não | — | — | — | — | — |
| 26 | Pagar por PIX AbacatePay com Ledger de repasse | não | — | — | — | — | — |
| 27 | Pagar por Cartão à vista: Normal (Efí) ou Rápido (AbacatePay) | não | — | — | — | — | — |
| 28 | Onboarding do Dono: checklist, Slug, link, QR Code e Pixel | sim | — | — | — | — | — |
| 29 | Área Ops: cadastrar Lojas, Plano, faixas, modo do cartão e taxas | sim | — | — | — | — | — |
| 30 | Prontidão para testes em produção | não | — | — | — | — | — |
| 31 | Nova landing, páginas públicas, blog, leads e SEO | não | — | — | — | — | — |

🔄 = já verificado antes, mas o código/ticket mudou depois — está na fila para nova verificação.

## Na fila

- `05` 05 — Gerenciar e publicar o Cardápio da Loja — nunca verificado
- `06` 06 — Configurar Complementos e montar o carrinho — nunca verificado
- `07` 07 — Aplicar horários e Pausa no Canal próprio — nunca verificado
- `08` 08 — Concluir o primeiro Pedido Guest na Retirada — nunca verificado
- `09` 09 — Adicionar Delivery por Taxa fixa ou bairro — nunca verificado
- `10` 10 — Pagar por PIX Woovi em `pilot_platform` — nunca verificado
- `11` 11 — Pagar por Crédito Asaas em `pilot_platform` — nunca verificado
- `16` 16 — Futuro: onboarding assistido de subconta `baas` — nunca verificado
- `17` 17 — Endurecer os portões de verificação do banco e do CI — nunca verificado
- `18` 18 — Instalar os seams compartilhados antes que as cópias se multipliquem — nunca verificado
- `19` 19 — Aprofundar os modules da API e do acesso a dados — nunca verificado
- `20` 20 — Aprofundar contratos e modules do Storefront e do Painel — nunca verificado
- `21` 21 — Fundar a stack Cloudflare: Workers, D1, CI/CD e contas — nunca verificado
- `22` 22 — Auth multi-Loja com Better Auth, RBAC e e-mail — nunca verificado
- `23` 23 — Portar Cardápio, Complementos e imagens para a stack nova — nunca verificado
- `24` 24 — Portar horários, Pausa, Pedido Guest, Delivery e impressão — nunca verificado
- `28` 28 — Onboarding do Dono: checklist, Slug, link, QR Code e Pixel — nunca verificado
- `29` 29 — Área Ops: cadastrar Lojas, Plano, faixas, modo do cartão e taxas — nunca verificado

## Como parar o loop

Crie o arquivo `.scratch/mvp-foode-delivery/verification/STOP` (`New-Item .scratch/mvp-foode-delivery/verification/STOP`) ou peça "pare o loop de verificação" no chat.
