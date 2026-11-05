# Documentação — Foode Delivery (meuifood)

Tese de produto e stack via pesquisa de mercado + grilling (jul/2026).

## Estrutura

| Pasta / arquivo | Conteúdo |
| --- | --- |
| [`CONTEXT.md`](../CONTEXT.md) | Glossário (linguagem ubíqua) — comece aqui para vocabulário. |
| [`FOODE-BRAND.md`](FOODE-BRAND.md) | Tokens de marca (logo) + regras de UI outline. |
| `decisoes/` | Decisões de produto e stack. Índices: [`16` tese produto](decisoes/16-tese-produto-fechada.md), [`28` tese stack](decisoes/28-tese-stack-mvp.md). |
| `decisoes/30-…` | Grilling de **lacunas e contrapontos** (rodada aberta). |
| `adr/` | ADRs técnicos load-bearing (por que surpreende). |
| `pesquisa/` | Benchmarks e trade-offs (**não** são decisões). |
| `DESIGN.md` | Referência de **densidade/spacing** (Airbnb) — marca = [FOODE-BRAND.md](FOODE-BRAND.md) / [37](decisoes/37-brand-foode-ui-outline-taste.md). |

## Status

- **Tese de produto:** concluída ([16](decisoes/16-tese-produto-fechada.md)); números comerciais vigentes em [31](decisoes/31-definicao-operacional-gmv.md) / [32](decisoes/32-taxas-e-assinatura-fixa-unica.md).
- **Tese de stack + libs/ops:** concluída ([28](decisoes/28-tese-stack-mvp.md), [29](decisoes/29-libs-ops-acrescimos-mvp.md)).
- **Grilling lacunas/contrapontos:** **fechado** ([30](decisoes/30-grilling-lacunas-e-contrapontos.md) · decisões [31](decisoes/31-definicao-operacional-gmv.md)–[45](decisoes/45-cupom-conta-e-fidelidade-pos-mvp.md)).
- **Grilling homologação BaaS / MEI vs LTDA:** fechado e **arquivado em 2026-11-04** ([60](decisoes/60-pagamentos-efi-abacatepay.md)) — [46](decisoes/46-grilling-homologacao-baas-mei-ltda.md) · [47](decisoes/47-tomadora-baas-ltda-apos-piloto.md)–[54](decisoes/54-implicacoes-minimas-modo-baas.md).
- **Pivô 2026-11-04:** infraestrutura 100% Cloudflare (Workers + D1 + Better Auth) — [59](decisoes/59-pivo-cloudflare-d1-workers.md) / [ADR 0006](adr/0006-cloudflare-workers-d1-sem-rls.md); pagamentos PIX Efí e Crédito Efí ou AbacatePay fixo por Loja — [60](decisoes/60-pagamentos-efi-abacatepay.md) / [ADR 0007](adr/0007-efi-abacatepay-provedor-fixo-por-loja.md). Supersede o stack Railway/Supabase/Woovi/Asaas ([55](decisoes/55-migrations-supabase-producao-ci.md), [56](decisoes/56-excecao-master-sem-branch-protection.md) e outras, marcadas no topo de cada arquivo) e arquiva a trilha BaaS ([46](decisoes/46-grilling-homologacao-baas-mei-ltda.md)–[54](decisoes/54-implicacoes-minimas-modo-baas.md)). Taxas comerciais de PIX/Crédito a redefinir.
- **Implementação:** Tickets 01–09 entregues na stack antiga (Railway/Supabase); a fila atual começa pelo port para a Cloudflare (Tickets 21–25), segue com PIX Efí (26) e Crédito (27). Ver [`.scratch/mvp-foode-delivery/HANDOFF.md`](../.scratch/mvp-foode-delivery/HANDOFF.md).
