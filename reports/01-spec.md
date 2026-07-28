# Ticket 01: review de Spec

**Fixed point:** `a4f0418a2c428f6618e2b43496c729a598923a2e`
**Fontes:** ticket 01 e `.scratch/mvp-foode-delivery/spec.md`

## Achados e decisões

| Achado | Viabilidade e decisão | Resultado |
| --- | --- | --- |
| Ticket marcado `done` antes de terminar o review. | O pedido exige `done` após aceite completo, não que permaneça aberto ao final. Durante as correções o status voltou a `ready-for-agent`. | **Corrigido no fluxo:** `done` só será confirmado após bateria verde e leitura destes relatórios. |
| Overlay da foto tinha fill branco sem outline. | O texto era dispensável e podia ser removido sem perda do contrato da landing. | **Corrigido:** overlay removido; a fotografia permanece sem container preenchido adicional. |
| Redaction cobria apenas parte dos campos sensíveis aninhados. | Requisito de segurança válido e testável no seam HTTP aprovado. | **Corrigido:** paths abrangem campos sensíveis em níveis aninhados; serializers reduzem request a método/path e response a status. |

Não houve scope creep material nem achado deferido. O status final do ticket é aplicável porque o objetivo solicitado é entregar o Ticket 01 concluído e revisado.

## Evidências de validação

- O teste `não registra credenciais, cookies, query ou dados pessoais recebidos` usa `app.inject`, captura o destino real do logger e prova que e-mail, Authorization, cookie e API key não chegam ao stdout.
- `GET /health` continua retornando JSON 200 pelo Fastify real.
- O teste de landing observa Canal próprio, `R$ 179`, `R$ 1.718,40`, `20% OFF` e o texto alternativo funcional da fotografia.
- O teste do Painel observa o shell e a navegação de Pedidos.
- O teste do package UI renderiza CTA, outline e `BrandMark` pelo contrato público.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`: todos passaram depois das correções.
- `public/images/mobile_ui.png` e `public/images/web_ui.png` continuam não rastreados e não são consumidos.
