# Dual gateway: Woovi (PIX) + Asaas (cartão/débito/voucher)

> **Superseded em 2026-11-04 por [ADR 0007](0007-efi-abacatepay-provedor-fixo-por-loja.md) / [60](../decisoes/60-pagamentos-efi-abacatepay.md).** Histórico.

Dois providers no módulo `payments`: **Woovi (PIX)** e **Asaas (crédito, débito, voucher)** — não um PSP único.

Motivo de negócio: bater MDR competitivo no mix delivery brasileiro. Taxas cobradas do comerciante vigentes em [32](../decisoes/32-taxas-e-assinatura-fixa-unica.md). Mercado Pago rejeitado como MDR principal. Trade-off: dois webhooks e duas contas — aceito porque um único PSP não cobria o pacote.

Ver arquitetura [24](../decisoes/24-arquitetura-pagamentos.md).

