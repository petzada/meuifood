# Modo piloto com custódia (`pilot_platform`)

O 1º cliente (amigo) opera em modo **`pilot_platform`**: cobranças no MEI/credenciais do founder, ledger de repasse (cartão D+32), **sem** onboarding de gateway no painel.

A pesquisa recomendava “conta Asaas por lojista” como caminho seguro para ~10 lojas. O piloto opta por custódia temporária para validar produto e taxas em dias, não semanas de KYC do lojista. Isso é **surpreendente e arriscado** (chargeback, MEI, LGPD, confiança) — por isso é explicitamente **só 1 cliente**, com acordo escrito de repasse, e **não** escala sem BaaS (`baas`) ou fallback `merchant_own_account`.

Código: enum de modo por loja; checkout não hardcoda o piloto. Ver [24](../decisoes/24-arquitetura-pagamentos.md).
