# 23 — Portar Cardápio, Complementos e imagens para a stack nova

**What to build:** O Dono gerencia Cardápio, Complementos e Adicionais no Painel e o Storefront publica o Cardápio, com o mesmo comportamento dos Tickets 05 e 06, agora sobre D1, Hono e R2 por binding — nascendo sobre os seams compartilhados em vez de copiar código.

**Blocked by:** 22 — Portar Auth e RBAC para Better Auth.

**Status:** ready-for-agent

**Agente:** Opus para API/dados; Fable para as telas do Painel e do Storefront, após o commit de contrato (schemas em `@foode/shared`).

- [ ] Categorias, itens, disponibilidade, Complementos e Adicionais portados para D1 com o comportamento e os testes HTTP dos Tickets 05/06.
- [ ] Upload de imagem: a `api` emite URL pré-assinada do R2 só para o Dono, com chave `stores/{store_id}/menu/{uuid}.{ext}`, JPEG/PNG/WebP até 5 MiB; leitura pública por base URL ([57](../../../docs/decisoes/57-cloudflare-r2-imagens-cardapio.md), sem chaves S3 se o binding resolver).
- [ ] Storefront resolve a Loja pelo Slug e nunca aceita `store_id` do navegador.
- [ ] Carrinho por Loja com recálculo no servidor.
- [ ] `@foode/shared` expõe dinheiro reais↔centavos em um só lugar (18.1); `admin` e `web` têm um adapter de transporte cada (18.2); controles de formulário e `Button` vêm de `@foode/ui` (18.3).
- [ ] Contrato público do Cardápio é um schema único em `@foode/shared`, parseado pelos apps (20.1, 20.3).
- [ ] Testes de vazamento cobrem Cardápio e imagens com duas Lojas.

## Comments

- 2026-11-04 — Aberto no pivô. Porta 05 e 06 e aplica a Fase A do Ticket 18 nos arquivos reescritos.

- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CAR-01 a CAR-07 e T-04/T-06/T-07; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §12. Em aberto: P-CAR-1 a P-CAR-5 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md) (reuso de grupos, pizza, classificações, cadastro assistido, edição em massa).

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) G1–G10, C1–C5, I1–I8, K1–K6; mapa em [MAPA-UX-CLIENTE](../../../docs/referencias/anota-ai/MAPA-UX-CLIENTE.md). Decidir antes do commit de contrato: P-1.1 (preço na opção de Complemento) e P-1.5 (observação por item); também P-1.4 e P-5.4 em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-1.1 (preço na opção de Complemento), P-1.4 (busca), P-5.4 (compartilhar item), P-5.5 (Destaques até 4), P-CAR-1 (copiar grupos), P-CAR-5 (preço inline), P-DS-1 (primary-strong em @foode/ui); sem obs. por item (P-1.5). Vale sobre as perguntas em aberto dos comentários anteriores.
