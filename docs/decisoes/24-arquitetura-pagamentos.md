# Decisão: arquitetura de pagamentos (Woovi + Asaas)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #7  
**Produto (números):** [32](32-taxas-e-assinatura-fixa-unica.md) · **Pesquisa ops:** [12](../pesquisa/12-stack-pagamentos-infra-integracoes.md)

## Decisão

### Forma do código

- Módulo **`payments`** na `api` com **providers** plugáveis: **`woovi`** (PIX) e **`asaas`** (crédito no MVP; débito/voucher pós-MVP — [34](34-meios-pagamento-checkout-mvp.md)).
- Cada loja tem **modo de cobrança** (enum/config), sem hardcode permanente do piloto no checkout:

| Modo | Quando | Comportamento |
| --- | --- | --- |
| **`pilot_platform`** | **Só comerciante-modelo** | Credenciais **MEI do founder** (env/secrets); money-in na conta Foode; **ledger de repasse** (crédito ~D+33; débito D+4; voucher D+16; PIX D+1) |
| **`baas`** | Pós-homologação na **LTDA** | Subcontas/split Asaas (e segregação Woovi se necessário); onboarding no `admin` — [46](46-grilling-homologacao-baas-mei-ltda.md)–[54](54-implicacoes-minimas-modo-baas.md) |
| **`merchant_own_account`** | Enum no código **apenas** | API keys do lojista; Foode não custodia. **Não** é plano comercial nem fallback automático se BaaS atrasar — [52](52-espera-sem-limite-ate-baas.md) |

Troca de modo = config da loja + secrets — **não** reescrever fluxo de checkout. Política comercial: piloto → LTDA → `baas`; zero novos até BaaS; piloto migra para subconta.

### Simplicidade do piloto (1 cliente) — requisito explícito

- MEI Asaas + Woovi do founder: **uma loja** em `pilot_platform`, secrets em env Railway, **zero** onboarding de gateway no painel do amigo.
- Ledger mínimo: pedido ↔ charge_id ↔ valor líquido ↔ data prevista repasse ↔ data pago.
- Webhooks: endpoint magro + idempotência + reconciliação (já padrão em [12](../pesquisa/12-stack-pagamentos-infra-integracoes.md)).
- Abstração de provider **existe**, mas implementação piloto = **caminho feliz curto** (sem UI de “conectar Asaas” no MVP do amigo).

## Fora / depois

- Homologação BaaS / LTDA Tomadora / UI onboarding subconta: **decididos** — [46](46-grilling-homologacao-baas-mei-ltda.md)–[54](54-implicacoes-minimas-modo-baas.md).  
- Implementar ou ativar `merchant_own_account` como política comercial (exigiria **nova** decisão — [52](52-espera-sem-limite-ate-baas.md)).  
- Estorno **parcial** / estorno sem cancelar pedido.

## Estorno (atualizado)

Cancelamento de pedido com PIX/crédito **já pago** → estorno **automático** via API Woovi/Asaas — [39](39-cancelamento-estorno-automatico.md). Na entrega = só status.

## Rejeitado

- Hardcode eterno sem modo/provider (refactor doloroso no 2º cliente).
- Conta-por-lojista **obrigatória** já no 1º cliente amigo.
- Subcontas Asaas em produção sem BaaS (teto R$ 2k).
- Estorno manual no gateway como caminho feliz do piloto (revogado por [39](39-cancelamento-estorno-automatico.md)).
