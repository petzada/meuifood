# Woovi para PIX e Asaas para cartão

Dois providers no módulo `payments`: **Woovi (PIX)** e **Asaas (cartão)** — não um PSP único.

Motivo de negócio: bater o MDR do comerciante-modelo (PIX 1,29% D+0 vs 1,40% D+1; cartão abaixo de 3,50%+R$0,99). Woovi vence no mix de ticket delivery no plano 0,80%; Asaas cobre cartão/MEI/caminho BaaS. Mercado Pago foi rejeitado como MDR principal de cartão. Trade-off: dois webhooks, duas contas, duas falhas — aceito porque um único PSP não batia o pacote de taxas.

Ver decisão de produto [06](../decisoes/06-gateways-taxas-e-tiers.md) e arquitetura [24](../decisoes/24-arquitetura-pagamentos.md).
