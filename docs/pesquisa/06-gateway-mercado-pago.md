# Pesquisa: gateway Mercado Pago (Brasil) — jul/2026

**Data:** jul/2026 · **Tipo:** validação de custos / fit multi-lojista (SaaS cardápio/delivery)  
**Escopo:** taxas públicas Checkout + Point, prazos, MEI, Split/Marketplace vs Asaas.

> Taxas **variam** por conta, volume, produto e prazo. Confirmar no painel (*Seu negócio → Custos / Simulador*) e/ou comercial. Valores abaixo = tabela pública na data da pesquisa.

## 1. Taxas públicas (referência)

### Checkout / online (site oficial Checkout)

Fonte: [Check-out](https://www.mercadopago.com.br/ferramentas-para-vender/check-out) · Pro e Transparente usam a **mesma lógica de taxa** (meio + prazo), não o tipo de checkout.

| Meio | Prazo | Taxa pública |
| --- | --- | --- |
| **PIX** | Na hora (D+0) | **0,99%** |
| **Crédito** | Na hora (D+0) | **4,98%** |
| **Crédito** | 14 dias (D+14) | **4,49%** |
| **Crédito** | 30 dias (D+30) | **3,98%** |
| **Débito Virtual CAIXA** | Na hora | **3,99%** |
| **Saldo Mercado Pago** | Na hora | **4,99%** |
| **Boleto** | Até ~3 dias | **R$ 3,49** |

### Point / presencial (blog — D+30, por faixa de faturamento)

Fonte: [Taxas Point](https://www.mercadopago.com.br/blog/maquininha-de-cartao-do-mercado-pago) (maio/2026).

| Faixa mensal | PIX | Débito | Crédito 1x | Crédito 12x |
| --- | --- | --- | --- | --- |
| Até R$ 3 mil | 0,49% | 1,99% | 4,98% | 22,59% |
| R$ 3–10 mil | 0,49% | 1,67% | 3,89% | 14,99% |
| > R$ 10 mil | 0,49% | 1,61% | 3,85% | 13,69% |

Promo frequente (novos / campanhas): PIX **0%**, débito/crédito 1x **~0,74%** (ex.: 30 dias ou até R$ 5 mil) — não assumir como permanente.

**Para o SaaS:** o número relevante de cartão online é a tabela Checkout (**~3,98–4,98%** crédito; **0,99%** PIX). Point é referência se loja usar maquininha MP, não o checkout da plataforma.

## 2. Prazos e antecipação

Fonte: [Prazos de recebimento](https://www.mercadopago.com.br/blog/quanto-tempo-demora-cair-pagamento-mercado-pago), [Antecipação](https://www.mercadopago.com.br/blog/antecipacao-de-recebiveis-mercado-pago).

| Meio | Liberação |
| --- | --- |
| **PIX** | Sempre **D+0** (instantâneo) |
| **Débito** (Point) | Sempre **D+0** |
| **Crédito** (Checkout / Point / Link) | Configurável: **D+0 / D+14 / D+30** (taxa sobe com prazo menor) |
| **Boleto** | Compensação 1–2 DU → disponível em **~D+3** |

**Antecipação:** (a) configurar plano **D+0** (taxa embutida); ou (b) antecipar venda individual fora do plano (taxa extra). Parcelado no D+0: valor total liberado no dia, com custo maior.

## 3. MEI — elegibilidade

Fontes: [Conta Negócio MEI](https://www.mercadopago.com.br/blog/conta-negocio-para-mei), [Abrir Conta Negócio](https://www.mercadopago.com.br/blog/conta-pj-do-mercado-pago).

- **MEI pode** abrir Conta Negócio (PJ) no MP: CNPJ ativo + CCMEI + docs do responsável; sem mensalidade de conta.
- Recebe via Point, Tap, link, checkout, Pix/QR.
- Pix “gratuito para MEI” no discurso de **conta** segue regra Bacen de recebimento; **cobranças via Checkout/Point ainda têm MDR** da tabela do produto (ex.: 0,99% checkout / 0,49% Point).

### Alerta MEI × marketplace

- Split público exige conta vendedor com **KYC 6** + app + OAuth — [Pré-requisitos Split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites).
- Docs **não** proíbem MEI explicitamente como seller; porém:
  - **Plataforma (integrator)** em escala multi-loja: risco de limite MEI (faturamento anual) se a receita/comissões da plataforma crescerem — preferir **LTDA/SLU** para a conta da SaaS.
  - Onboarding de cada loja = conta MP própria + autorização OAuth (fricção alta vs subconta Asaas/Woovi).
  - Modelo **1:N** (vários sellers numa cobrança) = **só carteira assessorada / comercial**.

## 4. Marketplace / Split / OAuth

Fontes: [Pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites), [OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth), [Split blog](https://www.mercadopago.com.br/blog/split-de-pagamento-dividir-comissoes-automaticamente).

| Item | Detalhe |
| --- | --- |
| Modelo público | **Split 1:1** (1 seller + comissão marketplace) |
| Checkout | Pro (`marketplace_fee`) ou Transparente/Bricks (`application_fee`) |
| Ordem de desconto | 1º taxa MP → 2º fee da plataforma sobre o restante |
| Auth | **OAuth** por loja → `access_token` do seller no backend; `public_key` do integrator no frontend |
| Token | Access ~**180 dias**; `refresh_token` ~**6 meses** (`offline_access`) |
| KYC | Conta vendedor **KYC 6** |
| Meios no split | Crédito, Pix, boleto (conforme checkout); split opera entre **contas MP** (sem transferir de banco externo no fluxo) |
| Estorno | Proporcional marketplace + seller; se seller sem saldo, marketplace só cobre sua parte |
| 1:N | Comercial / carteira assessorada |

**Fit SaaS multi-loja:** funciona, mas cada restaurante precisa **criar/vincular conta MP + OAuth**. Comissão da plataforma = `application_fee` / `marketplace_fee` (valor em R$, não %).

## 5. Comparativo rápido vs Asaas (multi-lojista)

| | **Mercado Pago** | **Asaas** |
| --- | --- | --- |
| **Modelo multi-loja** | Marketplace OAuth + Split 1:1 | **Subcontas** + `splits[]` (`walletId`) via API |
| **Onboarding loja** | Conta MP + OAuth (UX do seller) | Criação de subconta pela API da plataforma |
| **PIX** | **0,99%** (Checkout) | **R$ 1,99**/tx (promo ~R$ 0,99 / 3 meses) — [Preços](https://www.asaas.com/precos-e-taxas) |
| **Crédito à vista** | **~3,98–4,98%** (D+30→D+0) | **R$ 0,49 + 2,99%** (padrão; promo +1,99%) |
| **Settlement crédito** | D+0 / D+14 / D+30 | Liquidação típica ~D+30; antecipação **~1,25%/mês** |
| **Split fee** | Embutido na API (fee) | Split sobre líquido; API dedicada |
| **1:N** | Comercial | Vários `walletId` na mesma cobrança |
| **Marca / conversão** | Forte (Checkout Pro, saldo MP) | Mais “white-label” / API |
| **MEI lojista** | Conta Negócio ok | Conta/subconta PJ (incl. MEI) comum no produto |

**Leitura para o meuifood:**  
- **Cartão + multi-loja com onboarding leve** → Asaas geralmente mais simples (subcontas).  
- **Marca MP + Checkout Pro + fee por pedido** → MP viável se aceitar OAuth por loja.  
- **PIX barato** → Woovi (já pesquisado) costuma ganhar; MP Checkout PIX **0,99%** é caro no ticket baixo de delivery.

## 6. Links oficiais

- Checkout / taxas: https://www.mercadopago.com.br/ferramentas-para-vender/check-out  
- Prazos: https://www.mercadopago.com.br/blog/quanto-tempo-demora-cair-pagamento-mercado-pago  
- Point taxas: https://www.mercadopago.com.br/blog/maquininha-de-cartao-do-mercado-pago  
- MEI: https://www.mercadopago.com.br/blog/conta-negocio-para-mei  
- Split pré-requisitos: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites  
- OAuth: https://www.mercadopago.com.br/developers/pt/docs/security/oauth  
- Asaas preços: https://www.asaas.com/precos-e-taxas  
- Asaas split: https://docs.asaas.com/docs/duvidas-frequentes-split  

## Implicação rápida para o SaaS

Para delivery PME: **PIX → Woovi**; **cartão → Asaas** (MDR ~3% + onboarding subconta) tende a vencer MP Checkout (~4–5% e OAuth). MP só como opção se a loja já tiver conta MP e quiser Checkout Pro / conversão da marca — ou se comercial negociar tabela/1:N.
