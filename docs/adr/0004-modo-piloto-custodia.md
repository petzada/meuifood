# Modo piloto com custódia (`pilot_platform`)

O comerciante-modelo opera em modo **`pilot_platform`**: cobranças no MEI/credenciais do founder, ledger de repasse (cartão ~D+33), **sem** onboarding de gateway no painel do amigo.

A pesquisa recomendava “conta Asaas por lojista” como caminho seguro para ~10 lojas. O piloto opta por custódia temporária para validar produto e taxas em dias, não semanas de KYC do lojista. Isso é **surpreendente e arriscado** (chargeback, MEI, LGPD, confiança) — por isso é explicitamente **só 1 cliente**, com acordo escrito de repasse.

**Escala:** **não** generalizar custódia. Novos comerciantes e o próprio piloto (após homologação) vão para **`baas`** sob **LTDA** Tomadora. Espera **sem limite** até BaaS; `merchant_own_account` **não** é contingência comercial ([46](../decisoes/46-grilling-homologacao-baas-mei-ltda.md)–[54](../decisoes/54-implicacoes-minimas-modo-baas.md), [52](../decisoes/52-espera-sem-limite-ate-baas.md)).

Código: enum de modo por loja; checkout não hardcoda o piloto. Ver [24](../decisoes/24-arquitetura-pagamentos.md).
