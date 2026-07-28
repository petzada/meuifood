# Decisão: modelo de receita (SaaS + pagamento online)

**Data:** jul/2026 · **Status:** decidido (estrutura + números) · **Sessão:** grilling #4–#6  
**Detalhe numérico:** ver [06-gateways-taxas-e-tiers.md](06-gateways-taxas-e-tiers.md)

## Decisão

### 1) Assinatura — SaaS fixo por **faixa de faturamento** (3 preços)

- Mesmo produto completo em todos os planos (ver [11](11-planos-por-faturamento-features-completas.md)).  
- Diferenciação = **quanto a loja fatura**, não o que o software libera.  
- Valores R$ e cortes de GMV: **fechados** em [12](12-faixas-mensalidade-por-gmv.md) (R$ 129 / 179 / 229).

Objetivo: preço agressivo vs Anota/Goomer + previsibilidade; **sem comissão % sobre pedido** como modelo de produto.

### 2) Pagamento online — taxas pequenas, transparentes

Detalhe vigente: [06](06-gateways-taxas-e-tiers.md).

| Meio | Decisão |
| --- | --- |
| **PIX** | **Woovi**, plano **0,80%** (mín. R$ 0,50 / máx. R$ 5) → cobrir lojista **1,29%** D+0 |
| **Cartão** | **Asaas** → Visa/Master **3,29%+R$0,69** · Elo/outros **4,49%+R$0,69** · piloto MEI / depois BaaS |
| **Na entrega** | Fora do take da plataforma (maquininha do lojista) |

Nota: markup de gateway **não** é comissão de marketplace; a mensalidade SaaS continua sem % sobre o pedido como modelo de produto.

### 3) Explicitamente fora

- Take-rate alto estilo marketplace / comissão sobre pedido como receita principal.
- Intermediar taxa da maquininha “pagamento na entrega”.
- Mercado Pago como MDR principal de cartão.

## Em aberto (não bloqueia tese — ciclo stack/ops)

- Confirmar no contrato Asaas se Elo entra na mesma tabela de crédito à vista.  
- Homologação BaaS (execução).  
- Checklist fino de permissões dono vs operador (ADR).
