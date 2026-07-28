# 06 — Configurar Complementos e montar o carrinho

**What to build:** O Dono configura Complementos e Adicionais dos itens, e o Consumidor personaliza escolhas, quantidades e revisa um carrinho pertencente a uma única Loja.

**Blocked by:** 05 — Gerenciar e publicar o Cardápio da Loja.

**Status:** ready-for-agent

- [ ] Dono configura grupos de Complementos obrigatórios ou opcionais com opções ordenadas.
- [ ] Dono configura Adicionais com preços em centavos e disponibilidade.
- [ ] Regras inválidas são rejeitadas sem persistência parcial e Operador não acessa a configuração.
- [ ] O Consumidor não adiciona item enquanto faltar Complemento obrigatório.
- [ ] Quantidades e Adicionais atualizam a prévia do carrinho deterministicamente.
- [ ] O carrinho não mistura itens de Slugs ou Lojas diferentes.
- [ ] Valores do navegador são apenas prévia; o contrato referencia itens e escolhas para recálculo posterior no servidor.
- [ ] Alterações posteriores não reescrevem snapshots de Pedidos já concluídos.

