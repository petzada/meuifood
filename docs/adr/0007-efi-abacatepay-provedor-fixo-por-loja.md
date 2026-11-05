# PIX AbacatePay; Crédito Efí (Normal) ou AbacatePay (Rápido) por contrato; custódia com Ledger interno

PIX sai pela AbacatePay. O Crédito à vista tem dois provedores — Efí (Normal, ~21 dias úteis) e AbacatePay (Rápido, D+1) — e cada Loja usa o modo contratado, configurado pela operação Foode. Todo dinheiro entra nas contas **únicas** do Foode e o repasse é manual, em lote diário D+1 útil, pelo Ledger interno. Supersede [0003](0003-woovi-pix-asaas-cartao.md) e a trilha BaaS Asaas de [0004](0004-modo-piloto-custodia.md). Detalhes em [60](../decisoes/60-pagamentos-efi-abacatepay.md) e [61](../decisoes/61-monetizacao-faixas-taxas-anota.md).

O que surpreende: custódia para todas as Lojas (não só um piloto) com repasse manual, e dois provedores de cartão sem fallback automático. Cada cobrança grava provedor, modo, taxa Foode, custo do provedor e prazos; trocar o modo de uma Loja não reescreve o Ledger. Taxas ao lojista vêm de tabela com vigência no `/ops` e nascem vazias — meio sem taxa vigente fica fora do checkout.

Por quê: com os custos do Dono, AbacatePay é o PIX mais barato acima de ~R$ 45 e libera na hora, o que sustenta repasse D+1 igual ao Anota AI; a Efí é o cartão mais barato para quem aceita prazo; ambos já são operados no ceremony. Sem mTLS no caminho de pagamento.

**Considered:** Woovi + Asaas · PIX Efí · conta de provedor por Loja · split Efí · kill switch · D+7 antecipado.  
**Rejected:** BaaS Asaas (arquivado); conta Efí compartilhada com o ceremony; antecipação com caixa da Foode.
