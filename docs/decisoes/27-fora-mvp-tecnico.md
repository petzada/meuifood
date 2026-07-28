# Decisão: fora do MVP técnico

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #10

## Confirmado — não entra no build do MVP

| Item | Referência |
| --- | --- |
| API Meta / bot WhatsApp (só `wa.me`) | [07](07-canal-consumidor-web-mobile-first.md) |
| App nativo consumidor ou lojista | Tese web |
| iFood / sync marketplace | [09](09-ciclo-pedido-status.md) |
| Domínio custom / subdomínio por loja | [15](15-url-slug-e-marca-provisional.md) |
| Workspaces multi-unidade | [20](20-tenant-mvp-sem-workspaces.md) |
| WebSocket / SSE / Supabase Realtime no painel | [23](23-realtime-pedidos-polling.md) |
| Executar BaaS Asaas em produção (além do desenho/modos) | [06](06-gateways-taxas-e-tiers.md), [24](24-arquitetura-pagamentos.md) |
| UI de conta gateway por lojista | [24](24-arquitetura-pagamentos.md) |
| **Débito e voucher online no checkout** | [34](34-meios-pagamento-checkout-mvp.md) · taxas futuras em [32](32-taxas-e-assinatura-fixa-unica.md) |
| Redis, worker sempre-on, staging/preview | [25](25-hospedagem-ci-ops.md) · **Sentry free e Railway Cron entram** — [29](29-libs-ops-acrescimos-mvp.md) |
| Catálogo Airbnb inteiro (property-card, search-orb, …) / Rausch como marca | [37](37-brand-foode-ui-outline-taste.md) · tokens Foode em [FOODE-BRAND.md](../FOODE-BRAND.md) |
| KDS, NF-e, estoque completo, impressão térmica | [11](11-planos-por-faturamento-features-completas.md) |
| PCI próprio / multi-gateway (MP, Cielo, …) | [12](../pesquisa/12-stack-pagamentos-infra-integracoes.md) |
| Km / raio / geocoding na taxa de entrega | [42](42-taxa-delivery-bairro-ou-fixa.md) |

## Ops de produto no MVP (manual / enxuto — não é “feature plataforma” ainda)

- Checklist fino de permissões dono vs operador — **fechado** [38](38-rbac-dono-operador-mvp.md).  
- Homologação BaaS — **paralelo comercial**, não bloqueia código do piloto `pilot_platform`.  
- Teto GMV — comercial fora; sem enforcement — [33](33-teto-gmv-comercial-fora-do-produto.md).  
- Cobrança da **assinatura** Foode: pagamento **por fora** + **flag** de plano no painel (UI de billing existe, read-only no pagamento) — [35](35-ui-billing-plano-painel.md).

## Pós-MVP já registrados (não esquecer)

- Workspaces · WebSocket/SSE na Fastify · BaaS / `merchant_own_account` · PWA opcional · **cobrança automática da assinatura** (PIX recorrente Woovi e/ou cartão Asaas) — [35](35-ui-billing-plano-painel.md).
