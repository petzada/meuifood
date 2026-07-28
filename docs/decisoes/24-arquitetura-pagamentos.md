# Decisão: arquitetura de pagamentos (Woovi + Asaas)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #7  
**Produto (não reabrir):** [06](06-gateways-taxas-e-tiers.md) · **Pesquisa ops:** [12](../pesquisa/12-stack-pagamentos-infra-integracoes.md)

## Decisão

### Forma do código

- Módulo **`payments`** na `api` com **providers** plugáveis: **`woovi`** (PIX) e **`asaas`** (cartão).
- Cada loja tem **modo de cobrança** (enum/config), sem hardcode permanente do piloto no checkout:

| Modo | Quando | Comportamento |
| --- | --- | --- |
| **`pilot_platform`** | **Só 1º cliente** | Credenciais **MEI do founder** (env/secrets); money-in na conta Foode; **ledger de repasse** (cartão D+32; PIX conforme Woovi) |
| **`baas`** | Pós-homologação | Subcontas/split Asaas (e segregação Woovi se necessário) |
| **`merchant_own_account`** | Fallback se BaaS atrasar | API keys do lojista; Foode não custodia |

Troca de modo = config da loja + secrets — **não** reescrever fluxo de checkout.

### Simplicidade do piloto (1 cliente) — requisito explícito

- MEI Asaas + Woovi do founder: **uma loja** em `pilot_platform`, secrets em env Railway, **zero** onboarding de gateway no painel do amigo.
- Ledger mínimo: pedido ↔ charge_id ↔ valor líquido ↔ data prevista repasse ↔ data pago.
- Webhooks: endpoint magro + idempotência + reconciliação (já padrão em [12](../pesquisa/12-stack-pagamentos-infra-integracoes.md)).
- Abstração de provider **existe**, mas implementação piloto = **caminho feliz curto** (sem UI de “conectar Asaas” no MVP do amigo).

## Fora / depois

- Homologação BaaS (execução comercial/compliance).
- UI de onboarding de credenciais do lojista (modo `merchant_own_account`).
- Estorno self-service no painel (manual no gateway no piloto).

## Rejeitado

- Hardcode eterno sem modo/provider (refactor doloroso no 2º cliente).
- Conta-por-lojista **obrigatória** já no 1º cliente amigo.
- Subcontas Asaas em produção sem BaaS (teto R$ 2k).
