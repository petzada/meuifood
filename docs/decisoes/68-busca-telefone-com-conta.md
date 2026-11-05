# 68 — Busca por telefone no checkout quando o telefone tem conta Foode

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Complementa:** [63](63-decisoes-ux-benchmark-anota.md) (P-2.1), [65](65-login-consumidor-codigo-whatsapp.md)

- **Telefone sem conta Foode:** a busca continua mascarada e restrita aos Pedidos da mesma Loja (como no Ticket 24a).
- **Telefone com conta Foode:** o checkout oferece **"Entrar com WhatsApp"**; após o código, os dados vêm da **conta** (nome, CPF quando o meio exigir, último endereço usado) e valem em qualquer Loja. Sem o código, nenhum dado de outra Loja ou da conta é exibido, nem mascarado.
- Implementação no **Ticket 13** (a conta nasce lá); o 24a não muda.
