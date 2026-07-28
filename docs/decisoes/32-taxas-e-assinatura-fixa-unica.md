# Decisão: taxas Foode + assinatura fixa (supersede faixas)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas (resposta #A + pacote comercial)  
**Supersede:** números e faixas em [04](04-modelo-receita-saas-tiers-pagamento.md), [06](06-gateways-taxas-e-tiers.md), [12](12-faixas-mensalidade-por-gmv.md); tabela comercial em [16](16-tese-produto-fechada.md)  
**GMV:** [31](31-definicao-operacional-gmv.md) · **Gateways:** Woovi (PIX) + Asaas (cartão/débito/voucher) — arquitetura [24](24-arquitetura-pagamentos.md)

## 1) Taxas cobradas do comerciante (Foode)

| Meio | Gateway | Taxa ao comerciante | Liquidação |
| --- | --- | --- | --- |
| **PIX online** | Woovi | **1,19%** | **D+1** |
| **Crédito à vista** (qualquer bandeira) | Asaas | **3,29% + R$ 0,79** | **D+33** |
| **Débito** | Asaas | **2,19% + R$ 0,55** | **D+4** |
| **Voucher** | Asaas | **3,89%** | **D+16** |
| **Pagamento na entrega** | — | R$ 0 plataforma | Fora do take |

**Mudanças vs pacote anterior (revogado):** PIX 1,29% D+0 → **1,19% D+1**; crédito fixo por bandeira (sem Elo 4,49%); inclui **débito** e **voucher**; fixo crédito **R$ 0,79** (antes R$ 0,69); settlement crédito **D+33**.

Lacuna Elo no contrato Asaas ([04](04-modelo-receita-saas-tiers-pagamento.md) / grilling L): **fechada na política comercial** — crédito à vista = mesma tabela para qualquer bandeira. Validar custo Asaas no contrato para margem.

## 2) Assinatura SaaS

| Item | Valor |
| --- | --- |
| Mensal | **R$ 179,00** fixo recorrente |
| Teto incluso | Até **R$ 15.000,00** de GMV na plataforma / mês ([31](31-definicao-operacional-gmv.md)) |
| Acima do teto | **Negociar** com comercial / desenvolvedor (comportamento de produto — ver grilling) |
| Anual | **20% OFF** → **R$ 1.718,40** / ano (economia R$ 429,60 vs 12×179) |

**Revogado:** três faixas R$ 129 / 179 / 229 por cortes R$ 3,5k / 9,5k ([12](12-faixas-mensalidade-por-gmv.md)).

**Mantido de [11](11-planos-por-faturamento-features-completas.md):** mesmo produto completo para quem está na assinatura (sem gate de feature por preço).

## 3) Implicações de produto / stack

- Checkout online precisa modelar **quatro** meios: PIX, crédito, débito, voucher (+ na entrega fora do GMV/MDR).  
- Providers: Woovi = PIX; Asaas = crédito, débito, voucher.  
- Copy comercial e ledger piloto usam D+1 / D+33 / D+4 / D+16 conforme a tabela.  
- Billing: mensal R$ 179 ou anual antecipado R$ 1.718,40 — detalhe de cobrança da assinatura ainda pode ser ops manual no MVP ([27](27-fora-mvp-tecnico.md)).

## 4) Explicitamente fora (inalterado)

- Comissão % sobre pedido como modelo de produto.  
- Intermediar maquininha “na entrega”.  
- Mercado Pago como MDR principal.
