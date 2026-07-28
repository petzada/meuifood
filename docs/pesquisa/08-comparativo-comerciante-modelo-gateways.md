# Comparativo: comerciante-modelo × gateways × proposta

**Data:** jul/2026 · **Tipo:** apoio à decisão (grilling #6) · **Ainda não é decisão fechada** até confirmação

## 1. O que o comerciante-modelo paga hoje

| Item | Condição atual |
| --- | --- |
| PIX online | **1,40%** · D+1 |
| Crédito Visa/Master | **3,50% + R$ 0,99** · D+30 |
| Crédito Elo/outros | **5,00% + R$ 0,99** · D+30 |
| Mensalidade | **R$ 200**/mês |

## 2. Custos de gateway (seu lado)

| Provedor | Meio | Seu custo | Settlement | Nota |
| --- | --- | --- | --- | --- |
| **Woovi** (negociado) | PIX | **R$ 0,80** *ou* **0,80%** | D+0 (Pix) | Usar no modelo interno |
| **Asaas** (público) | Crédito à vista | **R$ 0,49 + 2,99%** | **D+32** | Antecipação ~1,25%/mês |
| **Asaas** | Débito | R$ 0,35 + 1,89% | D+3 | |
| **Asaas** | PIX | R$ 1,99/tx | ~na hora | Pior que Woovi — não usar Asaas p/ PIX |
| **Mercado Pago** Checkout | PIX | 0,99% | D+0 | Pior que Woovi negociado |
| **Mercado Pago** Checkout | Crédito | **3,98%** D+30 · **4,49%** D+14 · **4,98%** D+0 | Conforme plano | Sem +R$ fixo na tabela pública |

## 3. Simulação por ticket (custo total do meio)

Comparando **o que o lojista paga hoje** vs **custo puro do gateway** (sem seu markup).

### PIX — ticket R$ 50 / R$ 100

| | R$ 50 | R$ 100 |
| --- | --- | --- |
| Hoje (1,40%) | R$ 0,70 | R$ 1,40 |
| Woovi 0,80% | R$ 0,40 | R$ 0,80 |
| Woovi R$ 0,80 fixo | R$ 0,80 | R$ 0,80 |
| MP 0,99% | R$ 0,50 | R$ 0,99 |
| Asaas R$ 1,99 | R$ 1,99 | R$ 1,99 |

→ **Folga grande no PIX via Woovi** vs 1,40%. D+0 ainda **melhor** que D+1 atual.

### Crédito Visa/Master — ticket R$ 50 / R$ 100

| | R$ 50 | R$ 100 |
| --- | --- | --- |
| Hoje (3,50% + R$ 0,99) | R$ 2,74 | R$ 4,49 |
| Asaas (2,99% + R$ 0,49) | R$ 1,99 | R$ 3,48 |
| MP 3,98% D+30 | R$ 1,99 | R$ 3,98 |

→ **Asaas** abre mais margem vs o plano atual (esp. com o R$ 0,99 fixo do concorrente).  
→ **MP D+30 (3,98%)** também costuma ganhar do atual em tickets típicos de delivery (&lt; ~R$ 200); acima disso o % do concorrente (3,50%) pode ficar melhor que MP.

### Elo/outros — ticket R$ 100

| | R$ 100 |
| --- | --- |
| Hoje (5% + R$ 0,99) | R$ 5,99 |
| Asaas (mesma tabela pública crédito) | ~R$ 3,48 |
| MP 3,98% | R$ 3,98 |

→ Maior ganho de discurso está em **Elo/outras** se Asaas não diferenciar (confirmar no contrato Asaas).

## 4. Settlement: dá para “receber mais rápido”?

| | Hoje | Asaas | MP |
| --- | --- | --- | --- |
| PIX | D+1 | — (usar Woovi D+0) | D+0 |
| Crédito | D+30 | **D+32** (ligeiramente pior) | D+30 padrão; D+14/D+0 = **taxa bem maior** |

**Conclusão:** não venda “recebe mais rápido no cartão” como promessa principal no Asaas (D+32). No MP, D+14/D+0 **piora** o MDR e mata o gancho vs 3,50%+0,99.  
Gancho honesto: **taxa menor + PIX na hora**; cartão **equiparado/melhor em %**; prazo **parecido** (D+30); antecipação **opcional** (custo à parte).

## 5. Armadilha de escala (MEI + 10 lojas)

- **Asaas subcontas** em avaliação: ~**10** subcontas · **R$ 2.000**/subconta · **60 dias** → **insuficiente** para delivery real (estoura em poucos dias).
- Para validar GMV de verdade **sem BaaS/LTDA**:  
  **conta Asaas (ou MP) por lojista** + você integra com a chave deles, **ou** MP OAuth 1:1 (dinheiro na conta do lojista).  
- Seu take rate de pagamento: (a) embutido na taxa que você “vende” e fatura a diferença no fim do mês, **ou** (b) `application_fee` / split quando o provedor permitir.

## 6. Recomendação de stack

| Camada | Escolha | Por quê |
| --- | --- | --- |
| PIX | **Woovi** | Custo negociado imbatível vs 1,40% e vs Asaas/MP PIX |
| Cartão | **Asaas** (taxa-alvo) | Melhor MDR vs comerciante-modelo e vs MP; discurso “melhor que o SaaS atual” |
| Na entrega | Fora | Maquininha do lojista |
| Integração fase 0 (~10) | **1 conta Asaas por loja** (+ Woovi PIX na sua operação/split leve) | Evita teto R$ 2k das subcontas; MEI ok |
| Escala depois | LTDA + BaaS Asaas / split Woovi maduro | Quando passar de dezenas de lojas |

**Não recomendar MP como MDR principal** se o argumento é bater 3,50%+R$0,99 — no D+30 o Asaas ganha; no D+0 o MP fica caro (~4,98%).

## 7. Proposta de cobrança ao lojista (para confirmar)

### Take rates (fixos nos 3 tiers — simplicidade)

| Meio | Cobrar do lojista | Seu custo (ref.) | Margem aprox. | vs hoje |
| --- | --- | --- | --- | --- |
| **PIX** | **1,19%** · D+0 | 0,80% *ou* R$ 0,80 | ~0,39 p.p. se custo %; se custo fixo, margem sobe com ticket | Melhor que **1,40%** e melhor prazo |
| **Crédito Visa/Master** | **3,29% + R$ 0,69** · “D+30” (operacional Asaas **D+32** — comunicar com honestidade) | 2,99% + R$ 0,49 | ~0,30 p.p. + R$ 0,20 | Melhor que **3,50% + R$ 0,99** |
| **Crédito Elo/outros** | **4,49% + R$ 0,69** | ~2,99% + R$ 0,49 (se Asaas não diferenciar) | Folga maior | Melhor que **5% + R$ 0,99** |
| **Na entrega** | R$ 0 plataforma | — | — | Igual |

Se o custo Woovi for **fixo R$ 0,80**, alternativa equivalente: PIX **R$ 1,19**/pedido (margem R$ 0,39) — mais simples de explicar em ticket baixo.

### Mensalidade (3 tiers) — âncora R$ 200 do concorrente

| Tier | Preço sugerido | Papel | Lógica |
| --- | --- | --- | --- |
| **Entry** | **R$ 129**/mês | Cardápio + pedidos + PIX + na entrega | Agressivo p/ trocar; margem SaaS ok em onboarding local |
| **Mid** | **R$ 179**/mês | Entry + cartão online + gestão núcleo | **Abaixo de R$ 200** + taxas melhores = troca óbvia do comerciante-modelo |
| **Full** | **R$ 249**/mês | Mid + fidelidade/cupom + extras | Upsell quando operar estável |

Receita só Entry × 10 lojas ≈ **R$ 1.290**/mês recorrente (antes de taxas de pagamento) — alinhado à meta de validação.

Taxas de pagamento iguais nos 3 tiers (previsibilidade; “sem estrangular”). Diferenciar tier por **features**, não por MDR punitivo no Entry.

## 8. Pontos negativos (transparentes)

| Risco | Detalhe |
| --- | --- |
| Settlement cartão Asaas | **D+32** vs D+30 atual — quase empate, não é vitória |
| Elo no Asaas | Confirmar se bandeira entra na mesma tabela; senão recalibrar |
| Subcontas Asaas | **Não escalam** no MEI sem BaaS; GMV real quebra o teto R$ 2k |
| Take rate | Se o dinheiro cai direto na Asaas do lojista, seu markup precisa de **cobrança à parte** (mensal sobre GMV) ou split habilitado |
| MP | Mais fácil em OAuth/fee; **pior** para prometer MDR &lt; 3,50%+0,99 no crédito |
| Preço Entry R$ 129 | Agressivo — ok na cidade com suporte manual; revisar após 10 lojas |
| Compliance | Intermediar saldo de terceiros na sua conta MEI sem split adequado = risco; preferir conta do lojista |

## 9. Status

**Proposta desta pesquisa (PIX 1,19% · tiers por feature R$ 129/179/249):** superseded.

**Vigente:** [06](../decisoes/06-gateways-taxas-e-tiers.md) (PIX **1,29%**) · [11](../decisoes/11-planos-por-faturamento-features-completas.md) · [12](../decisoes/12-faixas-mensalidade-por-gmv.md) (mensalidade por GMV).
