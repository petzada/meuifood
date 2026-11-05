# Decisão: área Ops, multi-Loja e funcionalidades acrescentadas no benchmark Anota AI

**Data:** 2026-11-04 · **Status:** decidido · **Sessão:** revisão final antes da orquestração  
**Depende de:** [59](59-pivo-cloudflare-d1-workers.md), [60](60-pagamentos-efi-abacatepay.md), [61](61-monetizacao-faixas-taxas-anota.md)

**Supersede:** "um único Comerciante-modelo" da spec e do [ADR 0004](../adr/0004-modo-piloto-custodia.md); "sem Cupom além do de boas-vindas" de [45](45-cupom-conta-e-fidelidade-pos-mvp.md); scripts/endpoint com `FOODE_OPS_API_TOKEN` do Ticket 10.

## Decisão

### Multi-Loja e multi-login

- O app nasce pronto para **várias Lojas** com isolamento total por `store_id` (dados, sessões, permissões).
- Um usuário pode ter memberships em **várias Lojas** (Dono de uma, Operador de outra); o Painel tem **seletor de Loja** e toda request valida a membership da Loja escolhida no servidor.
- Toda Loja criada pelo Ops é tratada como cliente real ("modelo" = validada como produto pronto), não como fixture.

### Área Ops (`/ops` no Painel)

- Acesso só para usuários com papel global **`foode_ops`** (Better Auth); semeado por e-mail via variável de ambiente; RBAC no servidor; trilha de auditoria (quem, quando, o quê).
- O Ops **cadastra qualquer Loja** com tudo que ela precisa para começar: nome, CNPJ, Slug inicial, WhatsApp, endereço, chave Pix e titular para repasse, Plano (mensal/anual) e faixas, modo do cartão (Normal/Rápido), taxas da Loja (override com vigência) — e **convida o Dono** por e-mail.
- Estados da Loja: `onboarding` (criada, Dono configurando) → `active` (Plano ativo, recebe Pedidos) → `suspended`. Só `active` aceita Pedidos.
- O Ops também: edita tabelas padrão de taxas e de faixas, a tabela de custos dos provedores, vê margem por Loja, opera os **lotes diários de repasse** e marca pagos.

### Onboarding do Dono

- Ao aceitar o convite, o Dono define senha e completa o perfil: Slug (único, não reservado), dados de contato, horários, Delivery/Retirada, Cardápio, IDs de Pixel; copia o link e baixa o QR Code da Loja. Um checklist mostra o que falta para operar.

### Funcionalidades acrescentadas ao MVP

- **Pixel Meta e Google** (Dono informa IDs; Storefront dispara visualização, adicionar ao carrinho e compra, sem dados pessoais).
- **Cupons promocionais** além do de boas-vindas: código, % ou R$, validade, limite total de usos, pedido mínimo, ativo/inativo; recalculado no servidor.
- **Impressão do Pedido** no Painel: layout de cupom 80 mm via impressão do navegador, sem driver.
- **Débito/carteiras**: avaliados no Ticket 27; entram só se os provedores suportarem no checkout transparente.

### Continua fora (roadmap pós-piloto)

Robô de IA no WhatsApp, recuperador de vendas, PDV/balcão e mesas, KDS, NF, cashback/fidelidade por pedidos, integração iFood, agendamento de Pedidos, teste grátis, app nativo.

## Rejeitado

- Trava de uma Loja em `pilot_platform`; scripts de terminal para operação; trial; recursos grandes do Anota no MVP.
