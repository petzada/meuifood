# Decisão: guest → conta e vínculo de pedido

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #I  
**Depende de:** [10](10-checkout-guest-e-conta.md), [22](22-auth-lojista-e-consumidor.md)

## Decisão

### Guest checkout (MVP)

Dados mínimos **sem** e-mail obrigatório:

- Nome completo  
- Telefone (WhatsApp)  
- Endereço (se delivery)

### Criar conta após o pedido

1. Oferecer “criar conta” pós-pedido (incentivo de fidelidade se o dono ativar — [10](10-checkout-guest-e-conta.md)).  
2. Coletar **e-mail** + confirmar **telefone** do pedido.  
3. Auth: **magic link** Supabase ([22](22-auth-lojista-e-consumidor.md)).  
4. Vincular o **`order_id`** acabado à nova conta (`customer_user_id`).  
5. Opcional: vincular outros pedidos guest da **mesma** `store_id` com o **mesmo telefone** normalizado.  
6. **Sem** merge automático cross-loja.

## Rejeitado

- Exigir e-mail no guest checkout.  
- Merge de histórico entre lojas diferentes no MVP.
