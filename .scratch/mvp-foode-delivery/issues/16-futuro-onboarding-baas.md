# 16 — Futuro: onboarding assistido de subconta `baas`

> **Arquivado em 2026-11-04.** Histórico.

**What to build:** Somente após piloto validado, LTDA e homologação, ops cria e acompanha a subconta Asaas no Painel, protege credenciais e ativa a Loja em `baas` sem alterar o contrato de checkout nem apagar o Ledger histórico do piloto.

**Blocked by:** 15 — Reconciliar pagamentos e repasses por Railway Cron; piloto validado por julgamento manual; LTDA da Foode aberta; homologação BaaS Asaas concluída; playbook de marca e compliance recebido.

**Status:** archived

- [ ] O ticket permanece fora da fronteira enquanto qualquer bloqueador externo estiver pendente e não bloqueia o aceite do piloto.
- [ ] O fluxo fica no Painel como ferramenta assistida de ops, não como self-serve aberto.
- [ ] A UI cria e acompanha subconta, documentos e `onboardingUrl` conforme o contrato e playbook Asaas vigentes.
- [ ] `apiKey`, `walletId` e demais credenciais ficam protegidos e nunca são devolvidos ao Dono, Operador ou navegador.
- [ ] A ativação muda a Loja para `baas` no servidor sem reescrever o checkout.
- [ ] O Comerciante-modelo migra de `pilot_platform` para `baas` e novos Comerciantes nascem exclusivamente em `baas`.
- [ ] `merchant_own_account` não aparece como fallback ou UI.
- [ ] O histórico do Ledger do piloto permanece auditável depois da migração.

## Comments

- 2026-11-04 — Arquivado: a trilha BaaS Asaas não é mais o caminho de escala ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)). O modo pós-piloto é decisão aberta e ganhará ticket próprio quando decidido.
