# PIX Efí; Crédito Efí ou AbacatePay, fixo por Loja pela operação

PIX sai pela Efí. O Crédito à vista tem dois provedores — Efí (Normal) e AbacatePay (Rápido) — e cada Loja usa **um**, definido pela operação Foode. Supersede [0003](0003-woovi-pix-asaas-cartao.md) e a trilha BaaS Asaas de [0004](0004-modo-piloto-custodia.md). Detalhes em [60](../decisoes/60-pagamentos-efi-abacatepay.md).

O que surpreende: dois provedores de cartão no MVP, sem escolha do Dono e sem fallback automático. O provedor é configuração protegida da Loja; cada cobrança grava provedor, taxa e prazo efetivos, então trocar o provedor de uma Loja não reescreve o Ledger. Sem kill switch: se o provedor cair, o Crédito daquela Loja fica indisponível.

A conta Efí é exclusiva do Foode (segunda conta no mesmo CNPJ), separada do ceremony em credenciais, certificado, chave Pix, webhooks e extrato. A custódia do piloto (`pilot_platform`) continua, com repasse manual registrado no Ledger.

Por quê: reaproveita providers, padrões de mTLS por binding, tokenização e webhooks que o Dono já opera no ceremony; mantém prazo de recebimento como alavanca comercial por Loja sem expor a escolha no MVP.

**Considered:** Woovi + Asaas (anterior) · Dono escolhendo Rápido/Normal · kill switch como no ceremony · split Efí.  
**Rejected:** BaaS Asaas como caminho de escala (arquivado); conta Efí compartilhada com o ceremony.
