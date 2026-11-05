# 23 — Portar Cardápio, Complementos e imagens para a stack nova

**What to build:** O Dono gerencia Cardápio, Complementos e Adicionais no Painel e o Storefront publica o Cardápio, com o mesmo comportamento dos Tickets 05 e 06, agora sobre D1, Hono e R2 por binding — nascendo sobre os seams compartilhados em vez de copiar código.

**Blocked by:** 22 — Portar Auth e RBAC para Better Auth.

**Status:** ready-for-agent

- [ ] Categorias, itens, disponibilidade, Complementos e Adicionais portados para D1 com o comportamento e os testes HTTP dos Tickets 05/06.
- [ ] Upload de imagem: a `api` emite URL pré-assinada do R2 só para o Dono, com chave `stores/{store_id}/menu/{uuid}.{ext}`, JPEG/PNG/WebP até 5 MiB; leitura pública por base URL ([57](../../../docs/decisoes/57-cloudflare-r2-imagens-cardapio.md), sem chaves S3 se o binding resolver).
- [ ] Storefront resolve a Loja pelo Slug e nunca aceita `store_id` do navegador.
- [ ] Carrinho por Loja com recálculo no servidor.
- [ ] `@foode/shared` expõe dinheiro reais↔centavos em um só lugar (18.1); `admin` e `web` têm um adapter de transporte cada (18.2); controles de formulário e `Button` vêm de `@foode/ui` (18.3).
- [ ] Contrato público do Cardápio é um schema único em `@foode/shared`, parseado pelos apps (20.1, 20.3).
- [ ] Testes de vazamento cobrem Cardápio e imagens com duas Lojas.

## Comments

- 2026-11-04 — Aberto no pivô. Porta 05 e 06 e aplica a Fase A do Ticket 18 nos arquivos reescritos.
