# 69 — "Link personalizado" (ex-Slug) e redirecionamento permanente de links antigos

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Altera:** [15](15-url-slug-e-marca-provisional.md) e Ticket 28 (Slug sem histórico)

## Decisão

- **Nome:** em toda interface, copy e documentação para Dono, Ops e Consumidor, "Slug" passa a se chamar **Link personalizado**. No código e no banco o identificador técnico continua `slug` (renomear colunas e APIs não traz valor e exigiria migration contract).
- **Links antigos funcionam sempre:** cada troca de Link personalizado grava o anterior num histórico da Loja. Acessar `/loja/{link-antigo}` (e qualquer subcaminho, ex. `/loja/{antigo}/pedido/...`) responde **redirecionamento permanente (308)** para o mesmo caminho com o link atual, preservando a query string (inclui `?item=` e UTM). O QR impresso nunca precisa ser refeito.
- **Link antigo fica reservado à Loja:** nenhuma outra Loja pode usá-lo (evita sequestro de tráfego e QR apontando para concorrente). A própria Loja pode voltar a um link antigo; aí ele sai do histórico e vira o atual.
- **Encadeamento:** sempre um único salto para o link atual (sem cadeias de redirecionamento).
- **Loja suspensa:** o redirecionamento continua; o destino mostra o estado da Loja normalmente.
- O aviso "links e QR antigos param de funcionar" sai da tela; no lugar: "Seus links e QR antigos continuam funcionando."

## Boas práticas consideradas

308 preserva método e é tratado como permanente por buscadores (transfere relevância); query string preservada mantém campanhas; reserva impede reutilização maliciosa; um salto só evita latência e loops.
