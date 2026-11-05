# 64 — Revisão adversarial do escopo do MVP (após a decisão 63)

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Revisa:** [63](63-decisoes-ux-benchmark-anota.md)

Rodada de perguntas que contestou decisões de 59–63 buscando cortar excesso sem perder a promessa (Canal próprio com Cardápio, checkout com PIX/Cartão/Pagamento na entrega, fila de Pedidos, custódia com repasse rápido e Ops pela interface). Onde a decisão 63 não é citada abaixo, ela continua valendo.

## Mantido como estava

- Cartão com **dois modos**: Normal (Efí) e Rápido (AbacatePay) — [60](60-pagamentos-efi-abacatepay.md).
- Repasse **D+1 útil** com lote diário por Loja.
- Custos de provedor **e** margem por Loja no `/ops` (Ticket 29/14).
- Overrides de taxa Foode por Loja na tela do Ops.
- Busca do Consumidor pelo telefone **com as salvaguardas** da 63 (P-2.1).
- CEP no checkout e no cadastro da Loja.
- Bandeiras da maquininha configuráveis por Loja (débito/crédito, 3–4 principais).
- Funil de conversão **próprio** (visita → item → carrinho → checkout → Pedido), agregado por Loja, sem dado pessoal. O Pixel Meta/Google é apoio às campanhas do lojista, não fonte do funil Foode.
- Itens mais vendidos com quebra por dia da semana.
- Tour de 3 passos na fila; carrossel de Destaques (até 4 itens); imagem de capa da Loja; duas perguntas de perfil no primeiro acesso do Dono.
- Cupom com validade por data, ativar/desativar **e** dias da semana (D S T Q Q S S).

## Alterado

| Tema | Decisão |
| --- | --- |
| Conta do Consumidor (Ticket 13) | Mantém magic link, vínculo de Pedidos e Cupom de boas-vindas; **corta vários endereços salvos** (P-3.4 da 63 revogado). |
| Exportação de relatórios (Ticket 14) | **CSV** (UTF-8 com BOM, abre no Excel) + **impressão da tela em PDF** pelo navegador (CSS de impressão). Sem gerar PDF/XLSX no servidor. |
| TOP 10 clientes (Ticket 14) | Só Consumidores **com conta na Foode**; Guest nunca aparece, mesmo comprando muito. Sem exportação. |
| Suporte no Painel (Ticket 30) | **Sem link `wa.me`.** O espaço do widget fica disponível (desligado sem configuração) e a codebase ganha a base mapeada para o agente do agentes.chat + MCP (ponto de montagem, contrato de configuração, documento de integração). A implementação do agente e do MCP é pós-lançamento. |
| "Imprimir ao aceitar" (Ticket 24) | É uma **configuração da Loja** (liga/desliga); quando ligada, aceitar o Pedido abre a impressão 80 mm. |
| "Avisar no WhatsApp" (Ticket 24) | Ação **por Pedido**, no detalhe (`wa.me` com texto fixo por status). |
| Ticket 20 (deepening do front) | **Cortado como ticket.** Os critérios viram itens de revisão no `/code-review` de cada ticket de UI (23, 24, 28, 29, 13, 14). |

## Esclarecimento técnico (sem pergunta; decisão 59 vence)

- Upload de imagem do Cardápio: **sem URL pré-assinada S3** (a decisão 59 tirou as credenciais S3). O admin envia os bytes pela RPC do service binding e a api grava no R2 pelo binding `MEDIA`; leitura pública por rota da api ou domínio público do bucket.

## Consequências na fila

- Fila do HANDOFF: o passo 10 (Ticket 20) sai; o 30 passa a depender de 14 e 15.
- Tickets afetados recebem um Comment de 2026-11-05 citando esta decisão.
