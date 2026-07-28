# Decisão: gateways, taxas ao lojista e tiers

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling #6 (fechamento)

## 1) PIX — Woovi: plano escolhido

### Decisão de custo (sua conta Woovi)

**Plano percentual: 0,80%** por PIX, com **mín. R$ 0,50** e **máx. R$ 5,00**.

| Ticket típico delivery | Custo plano % | Custo plano fixo R$ 0,80 | Vencedor |
| --- | --- | --- | --- |
| R$ 35–62 | **R$ 0,50** (piso) | R$ 0,80 | **%** |
| R$ 80 | R$ 0,64 | R$ 0,80 | **%** |
| R$ 100 | R$ 0,80 | R$ 0,80 | Empate |
| R$ 150+ | R$ 1,20+ | R$ 0,80 | Fixo |

Delivery concentra ticket **abaixo de ~R$ 100** → o plano **%** reduz seu custo na maior parte do volume e aumenta margem com a mesma taxa ao lojista. Revisar só se o ticket médio real passar de ~R$ 120 de forma estável.

**Saques Woovi:** configurar auto-saque com saldo **≥ R$ 500** (saque grátis). Evitar saques &lt; R$ 500 (R$ 1,00) no dia a dia.

### Taxa cobrada do comerciante (PIX)

| | Valor |
| --- | --- |
| **Cobrar** | **1,29%** por pedido pago via PIX · liquidação **D+0** (Woovi) |
| Vs concorrente-modelo | **1,40%** · D+1 → você é **mais barato e mais rápido** |
| Margem aprox. (ticket R$ 55) | Receita ~R$ 0,71 − custo piso R$ 0,50 ≈ **R$ 0,21**/pedido |
| Margem (ticket R$ 100) | R$ 1,29 − R$ 0,80 ≈ **R$ 0,49**/pedido |

Não usar piso alto na cobrança ao lojista (ex.: mín. R$ 0,99): em tickets baixos ficaria **pior** que os 1,40% do concorrente.

## 2) Cartão — Asaas (MEI) + como lidar com R$ 2.000/subconta

### Decisão

**Cartão online via Asaas.** MEI ok para começar.

### O limite R$ 2.000 é oficial?

**Sim.** Período de avaliação regulatória (Bacen / BaaS), documentado pelo Asaas:

- até **10** subcontas de titulares diferentes  
- até **R$ 2.000** em cobranças **por** subconta  
- até **60 dias** após a 1ª subconta  

Fontes: [docs subcontas](https://docs.asaas.com/docs/criacao-de-subcontas), [FAQ avaliação](https://docs.asaas.com/docs/faq-periodo-de-avaliacao), [central de ajuda](https://central.ajuda.asaas.com/hc/pt-br/articles/47492800481563-Quais-s%C3%A3o-os-limites-do-Per%C3%ADodo-de-Avalia%C3%A7%C3%A3o).

Ao bater qualquer teto → bloqueio até **homologação BaaS**. Não é “bug”; é compliance. **Não há contorno legítimo** (criar várias contas pai, etc.) — risco de encerramento.

### Caminhos possíveis

| Caminho | O que é | Veredito fase ~10 lojas |
| --- | --- | --- |
| **A — Conta Asaas por lojista** | Cada comerciante abre a própria conta; você integra API key / onboarding assistido; dinheiro vai **direto p/ ele**; seu take rate de cartão cobra na **mensalidade** ou **ajuste mensal sobre GMV** | **Recomendado agora** — sem teto R$ 2k; MEI seu e dele ok; menos custódia |
| **B — Subcontas + homologar BaaS** | Usar avaliação só p/ piloto mínimo; já no dia 1 abrir homologação com gerente Asaas | Fase 2 / paralelo — burocrático (playbook marca Asaas, docs, Resoluções 16/17) |
| **C — Você recebe tudo e “libera” depois** | Cobrança no seu CNPJ MEI → PIX manual/semanal ao lojista | **Não recomendado** como modelo: você vira intermediário de fato (chargeback no seu nome, receita/faturamento aparente, limite MEI, LGPD de pagador, confiança, Bacen). Mais risco que BaaS formal |

### Decisão operacional

| Fase | Caminho | Escopo |
| --- | --- | --- |
| **Piloto — 1º cliente (comerciante-modelo, amigo)** | **C temporário** | Cartão no **Asaas do seu MEI**; repasse manual **D+32** |
| **Lançamento / novos clientes** | **B (BaaS)** | Homologação **antes** de prospectar além do piloto; subcontas/split como padrão |
| **Fallback se BaaS atrasar** | **A** | Conta Asaas por lojista — não generalizar C |

#### Regras do piloto C (obrigatório documentar com o amigo)

- Acordo explícito: prazo de repasse (**D+32**), taxas descontadas (MDR Asaas + seu take), chargeback/estorno a cargo de quem.
- Extrato simples por período (pedidos cartão × valor líquido × data de repasse).
- **Não** escalar C para os ~10 sem BaaS ou caminho A — risco MEI, custódia e LGPD cresce com volume/terceiros.
- Objetivo do C: **validar produto + taxas** rápido; não é o modelo definitivo de plataforma.

### Taxas de cartão ao comerciante (âncora do modelo)

Custo Asaas ref.: **R$ 0,49 + 2,99%** crédito à vista · settlement **D+32** (comunicar como ~D+30 / “conforme Asaas”).

| Meio | Cobrar do lojista | Vs comerciante-modelo |
| --- | --- | --- |
| Visa / Mastercard | **3,29% + R$ 0,69** | Melhor que **3,50% + R$ 0,99** |
| Elo / outros | **4,49% + R$ 0,69** | Melhor que **5,00% + R$ 0,99** |
| Na entrega | R$ 0 plataforma | Lojista + maquininha própria |

Mesmas taxas de pagamento em **todas as faixas de mensalidade** (previsibilidade).

## 3) Mensalidade — por faturamento (não por features)

**Revogado (grilling #11):** preços R$ 129 / 179 / 249 com features diferentes por tier.

**Vigente:** [11](11-planos-por-faturamento-features-completas.md) + [12](12-faixas-mensalidade-por-gmv.md) — **3 preços por GMV**, **todas as features em todos os planos** (R$ 129 / 179 / 229).

Taxas PIX/cartão permanecem iguais para todos (não variam por faixa de mensalidade).

## 4) Pacote fechado (resumo)

- **PIX:** Woovi plano **0,80%** (piso/teto) → cobrir lojista **1,29%** D+0; saque ≥ R$ 500.  
- **Cartão:** Asaas — piloto 1º = MEI + repasse D+32; **demais clientes após BaaS**. Taxas: **3,29%+R$0,69** / **4,49%+R$0,69**.  
- **SaaS:** 3 preços por **GMV** — **R$ 129 / R$ 179 / R$ 229** (ver [12](12-faixas-mensalidade-por-gmv.md)); features completas ([11](11-planos-por-faturamento-features-completas.md)).  
- **Na entrega:** fora do take da plataforma.

## 5) Explicitamente rejeitado

- Plano Woovi fixo R$ 0,80 como padrão (pior no mix de delivery).  
- Subcontas Asaas como caminho principal **sem** homologação BaaS (teto R$ 2k inviável para delivery real).  
- Custódia manual “eu recebo e repasso” como **modelo definitivo** (permitida **só** no piloto do 1º cliente-amigo enquanto BaaS não sai).  
- Mercado Pago como MDR principal de cartão (pior para bater o comerciante-modelo).
