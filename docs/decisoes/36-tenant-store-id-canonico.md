# Decisão: tenant canônico `store_id`

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #B  
**Depende de:** [20](20-tenant-mvp-sem-workspaces.md), [21](21-banco-orm-multitenant.md)

## Decisão

- Tenant de dados no MVP = **Loja**.  
- Coluna / FK canônica em todas as tabelas de negócio: **`store_id`**.  
- Inclui: cardápio, pedidos, membros (`store_members`), plano/billing ([35](35-ui-billing-plano-painel.md)), configs de frete, etc.  
- Dono e operador = **membership** da loja (`role`), não uma entidade tenant `merchant` separada.  
- **Não** usar `merchant_id` nem `workspace_id` no schema do MVP.

## Motivo

1 comerciante = 1 loja no MVP ([20](20-tenant-mvp-sem-workspaces.md)). `merchant_id` colide semanticamente com IDs de gateway (Asaas/Woovi). `workspace_id` foi revogado no MVP.

## Rejeitado

- `merchant_id` como FK de tenant.  
- Introduzir `workspace_id` “por precaução”.
