# 76 — Taxas padrão da Foode por meio de pagamento

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Complementa:** [60](60-pagamentos-efi-abacatepay.md), [61](61-monetizacao-faixas-taxas-anota.md)

Tabela padrão da taxa Foode (vale para todas as Lojas sem override), já cadastrada pelo Dono no `/ops` em produção em 05/11/2026 (vigência aberta):

| Meio | Taxa Foode |
| --- | --- |
| PIX | 1,19% |
| Cartão de crédito — Normal (Efí, liberação em até 21 dias úteis) | 3,49% + R$ 0,99 por transação |
| Cartão de crédito — Rápido (AbacatePay, liberação D+1) | 5,42% + R$ 1,59 por transação |

- O **repasse** ao lojista é sempre em **lote diário** com os valores já liberados (PIX ou cartão), independente do modo.
- Custos dos provedores cadastrados no `/ops`: AbacatePay PIX R$ 0,54, envio de repasse R$ 0,80, cartão 5,42% + R$ 0,60; Efí cartão 3,49%. A linha "Efí — envio de repasse 1,19%" deve ser conferida pelo Dono (o repasse sai pela AbacatePay).
- A landing exibe essas taxas no comparativo e no bloco "Modo rápido no cartão" (constantes em `apps/web/src/content/pricing.ts`, conferidas contra `/contato/taxas`).
