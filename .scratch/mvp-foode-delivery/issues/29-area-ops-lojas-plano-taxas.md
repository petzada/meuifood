# 29 — Área Ops: cadastrar Lojas, Plano, faixas, modo do cartão e taxas

**What to build:** No `/ops` do Painel, a equipe Foode cadastra qualquer Loja com tudo que ela precisa para começar, convida o Dono, define Plano e faixas, modo do cartão e taxas com vigência, mantém custos dos provedores e ativa ou suspende a Loja — com auditoria.

**Blocked by:** 22 — Auth multi-Loja com Better Auth, RBAC e e-mail.

**Status:** ready-for-agent

**Agente:** Opus para API/domínio; Fable para as telas, depois do commit de contrato (schemas Zod em `@foode/shared`).

- [ ] Rotas `/ops/*` só para `foode_ops`, via service binding; toda mutação grava auditoria (quem, quando, antes/depois).
- [ ] Cadastro de Loja: nome, CNPJ, Slug inicial (único/não reservado), WhatsApp, endereço, chave Pix e titular de repasse; nasce em `onboarding`.
- [ ] Convite do Dono por e-mail (fluxo do Ticket 22); reenviar convite.
- [ ] Plano por Loja (mensal/anual); tabela de faixas editável com vigência, semeada com R$ 84,99 (até 150), R$ 169,99 (151–250), R$ 254,99 (250+) e anual 12× R$ 84,99 ([61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)).
- [ ] Ativar (`active`) e suspender a Loja; só `active` aceita Pedidos.
- [ ] Modo do cartão por Loja: Normal (Efí) ou Rápido (AbacatePay).
- [ ] Taxa Foode: tabela padrão por meio/modo (% + fixo) e override por Loja, ambas com vigência; nascem vazias; histórico preservado; API expõe "taxa vigente" para o checkout.
- [ ] Tabela de custos dos provedores (Ops-only), semeada com os custos atuais: AbacatePay PIX R$ 0,54, envio Pix R$ 0,80, cartão 5,42% + R$ 0,60; Efí cartão 3,49%, envio Pix 1,19%.
- [ ] Lista de Lojas com estado, Plano, faixa do mês e checklist de onboarding.
- [ ] Telas no visual Foode (outline, Nunito, `#F35050`).
- [ ] Testes: RBAC (Dono/Operador negados), vigência (taxa futura não vale hoje), auditoria, Slug duplicado.

## Comments

- 2026-11-04 — Aberto na revisão final ([62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md)). Lotes de repasse ficam no Ticket 14.

- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) OPS-01 a OPS-05 e T-06 (máscaras de CNPJ/WhatsApp com dígito verificador); mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §2 e §6. Em aberto: P-CFG-4 (CEP autopreenche o endereço) de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).
