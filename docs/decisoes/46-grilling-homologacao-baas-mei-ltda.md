# Grilling (grill-with-docs) — homologação BaaS Asaas · MEI vs LTDA

**Data:** jul/2026 · **Status:** fronteira **fechada** · entendimento compartilhado **confirmado** · **Último:** #8 → [54](54-implicacoes-minimas-modo-baas.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md) · **Âncoras:** [24](24-arquitetura-pagamentos.md) · [06](06-gateways-taxas-e-tiers.md) · [30](30-grilling-lacunas-e-contrapontos.md) item M  
**Não reabre:** tese produto/stack, taxas [32], meios MVP [34], UI geral

## Objetivo cumprido

1. O que a Asaas exige → fatos + [53](53-checklist-evidencias-baas-asaas.md)  
2. MEI vs LTDA → [47](47-tomadora-baas-ltda-apos-piloto.md) / [48](48-gatilho-piloto-validado-ltda.md)  
3. Caminho de escala → [49](49-novos-clientes-so-apos-baas.md)–[52](52-espera-sem-limite-ate-baas.md)  
4. Checklist de evidências → [53](53-checklist-evidencias-baas-asaas.md)  
5. Implicações mínimas de código → [54](54-implicacoes-minimas-modo-baas.md)

## Veredito

| Tema | Decisão |
| --- | --- |
| **MEI dá para Tomadora BaaS?** | **Não neste plano** — MEI só `pilot_platform` (1 comerciante-modelo) |
| **LTDA quando?** | Após **piloto validado** (julgamento founder); **antes** do pedido formal de homologação |
| **Ativar `baas`** | Só após homologação na LTDA; migrar piloto; novos nascem em `baas` (UI onboarding no `admin`) |
| **`merchant_own_account`** | Não é contingência comercial; espera sem limite até BaaS |
| **Pós-validação** | Tudo migra para **subcontas** (`baas`) — sem custódia MEI eterna |

## Fechado nesta sessão

| # | Decisão |
| --- | --- |
| 1 | [47](47-tomadora-baas-ltda-apos-piloto.md) — MEI só piloto; Tomadora = LTDA após piloto validado |
| 2 | [48](48-gatilho-piloto-validado-ltda.md) — Gatilho = julgamento founder; sem métrica escrita |
| 3 | [49](49-novos-clientes-so-apos-baas.md) — Só 1 modelo até BaaS; próximos esperam |
| 4 | [50](50-migracao-piloto-para-baas.md) — Piloto migra para subconta `baas` |
| 5 | [51](51-contato-informativo-asaas-piloto.md) — Contato informativo no piloto |
| 6 | [52](52-espera-sem-limite-ate-baas.md) — Zero novos até BaaS |
| 7 | [53](53-checklist-evidencias-baas-asaas.md) — Checklist / sequência canônica |
| 8 | [54](54-implicacoes-minimas-modo-baas.md) — Mínimo + UI onboarding subconta no `admin` |

## Riscos do `pilot_platform` (lembrete)

Custódia no MEI, chargeback no nome do founder, faturamento aparente, LGPD de pagadores, acordo/ledger de repasse — **só 1 loja**, sem escalar ([0004](../adr/0004-modo-piloto-custodia.md)).

## Próximo passo

Executar contato informativo Asaas ([51](51-contato-informativo-asaas-piloto.md)) em paralelo ao build do piloto; LTDA + homologação formal só após piloto validado ([48](48-gatilho-piloto-validado-ltda.md)).
