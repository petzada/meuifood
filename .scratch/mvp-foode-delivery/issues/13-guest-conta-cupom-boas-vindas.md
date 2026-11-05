# 13 — Conta do Consumidor, Cupom de boas-vindas e Cupons promocionais

**What to build:** O Consumidor entra por código de 4 dígitos no WhatsApp e cria uma conta única na Foode (nome + CPF); os Pedidos Guest feitos com o mesmo telefone na mesma Loja passam a aparecer na conta; o Dono configura o Cupom de boas-vindas e Cupons promocionais, aplicados e recalculados no servidor no checkout.

**Blocked by:** 24a — Storefront: checkout, Pedido e acompanhamento.

**Status:** done

**Agente:** Opus para API/regras; Fable para telas de cupom (Painel) e conta (Storefront), após o contrato.

### Login e conta do Consumidor ([65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md))

- [ ] O Consumidor entra **só** por código no WhatsApp; não existe magic link nem senha para Consumidor. Dono, Operador e Ops seguem com e-mail e senha (Ticket 22).
- [ ] Mensagem enviada pela API da **whatsmiau.dev** a partir do número oficial da Foode, com o texto exato `XXXX é o seu código de acesso ao Foode Delivery.`; chave e id da instância só em `wrangler secret`.
- [ ] Código de **4 dígitos**, válido por **5 min**, no máximo **5 tentativas**, reenvio liberado após **30 s**; guardado só como hash e de uso único (usado, expirado ou esgotado → novo código).
- [ ] Rate limit por telefone **e** por IP, e Turnstile, no pedido de código e na verificação; erro não revela se o telefone tem conta.
- [ ] Sem secrets da whatsmiau configurados, o login responde com erro controlado "Login pelo WhatsApp indisponível no momento" e o checkout Guest segue funcionando (teste cobre os dois casos).
- [ ] Depois do primeiro código, a criação da conta pede **nome + CPF**; CPF validado (dígito verificador) no servidor e obrigatório; Guest continua pedindo só com nome e telefone.
- [ ] **Um telefone = uma conta; um CPF = uma conta** (constraints `UNIQUE`); conflito bloqueia a criação sem revelar dados da outra conta; com o widget de suporte ativo no Storefront, a mensagem orienta "Fale com o suporte Foode pelo chat"; com o widget desligado, informa só que não foi possível concluir (sem canal até a ativação do widget, risco aceito na [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md)); sem link `wa.me` de suporte.
- [ ] Troca de telefone da conta só pelo Ops no `/ops` (busca por telefone ou CPF), com auditoria (quem, quando, antes/depois); o Consumidor não troca o próprio número.
- [ ] **Conta única na Foode, dados por Loja:** o mesmo login vale em qualquer Loja; Pedidos, Cupom de boas-vindas e histórico ficam separados por Loja e nenhuma consulta da conta atravessa Lojas.
- [ ] Vínculo de Pedidos Guest pelo **telefone verificado na mesma Loja** (telefone normalizado), sem recriar o Pedido e sem e-mail; Pedidos de outra Loja nunca aparecem.
- [ ] Novo Pedido autenticado já nasce ligado à conta, com nome e telefone preenchidos; o checkout Guest continua disponível.
- [ ] A conta guarda nome, telefone e CPF; **não** há vários endereços salvos (P-3.4 revogado pela [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)); o checkout autenticado usa o mesmo formulário de endereço do Guest (com "Lembrar meus dados" do 24a).
- [ ] Sessão do Consumidor separada da identidade de membro (Dono/Operador/Ops) e respeitando a fronteira de exposição da decisão [59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md); cookie `httpOnly`, `Secure`, `SameSite=Lax` no domínio do Storefront.
- [ ] A busca de dados pelo telefone no checkout (P-2.1, entregue no 24a) continua sem código e não é afetada pelo login.

### Cupons

- [ ] Cupom de boas-vindas opt-in por Loja (R$ ou %), de **primeira compra**: emitido só com programa ativo e só se a conta não tem nenhum Pedido naquela Loja (Pedidos Guest vinculados pelo telefone contam e bloqueiam); uso único por conta por Loja ([66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md)); seção própria no topo de `/cupons` com interruptor e texto do que o Consumidor recebe (CUP-04).
- [ ] Cupons promocionais: código único por Loja (maiúsculas automáticas), % ou R$, validade por data, limite total de usos, pedido mínimo, ativo/inativo.
- [ ] Cupom percentual aceita **teto de desconto em R$** opcional (P-CUP-1).
- [ ] Cupom pode valer só em **dias da semana escolhidos** (D S T Q Q S S), conferidos no fuso `America/Sao_Paulo` no servidor; nenhum dia marcado = todos os dias (P-CUP-3).
- [ ] 2–3 **modelos** que só preenchem o formulário (ex.: "10% na primeira compra", "R$ 5 acima de R$ 40"); nada é ativado sem o Dono salvar (P-CUP-5, CUP-05).
- [ ] Formulário numa página com **resumo vivo** do Cupom; lista em tabela com Código, Desconto, Pedido mínimo, Validade, Usos, Status (Ativo/Inativo/Expirado/Esgotado) (CUP-01 a CUP-03).
- [ ] Sem vitrine de Cupons no Storefront: o Consumidor só aplica por código, inline no checkout (P-7.1, U1–U4).
- [ ] Sem Cupom de frete: o desconto nunca incide sobre a taxa de Delivery (P-CUP-2).
- [ ] Um Cupom por Pedido; desconto recalculado no servidor, nunca abaixo de zero; adulteração rejeitada; erro específico por código ("Cupom não encontrado", "Este cupom expirou", "Não vale hoje" etc.); uso contado de forma atômica com o Pedido.
- [ ] Ledger e taxa Foode usam o total efetivamente pago.
- [ ] Operador não vê nem altera Cupons.

### Testes e revisão

- [ ] Testes: código (expiração, 5 tentativas, reenvio em 30 s, uso único, hash), rate limit, CPF inválido/duplicado, telefone duplicado, vínculo só na mesma Loja, login indisponível sem secrets, Cupom de boas-vindas não emitido para conta com Pedido (inclusive Guest vinculado) na Loja e emitido em outra Loja sem Pedido; Cupom com limite de usos sob concorrência, validade, dias da semana, teto %, pedido mínimo, cross-Loja. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI; whatsmiau fake no limite HTTP.
- [ ] UI segue as [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) (U1–U4, §6 criar conta) e [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) (CUP-01 a CUP-05, NAV-01, T-06, T-08) aplicáveis e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, regra separada da apresentação, matriz de papéis em module, testes que afirmam comportamento).
- [ ] Revisão de segurança no `/code-review`: CPF e telefone fora de logs/Sentry, enumeração de contas impossível pelas mensagens de erro.
- [ ] Checkout: se o telefone digitado tem conta Foode, oferecer "Entrar com WhatsApp"; após o código, preencher com os dados da conta em qualquer Loja; sem código, nada da conta é exibido ([68](../../../docs/decisoes/68-busca-telefone-com-conta.md)).

## Comments

- 2026-11-04 — Revisado: Better Auth + MillionSend ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)); Cupons promocionais por [62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md). Pode correr em paralelo ao 26/27.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CUP-01 a CUP-05, NAV-01 (rota `/cupons` sob `store.settings`) e T-06/T-08; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §13. Extras do Anota em aberto: P-CUP-1 a P-CUP-5 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md); cupom de frete (P-CUP-2) diverge do critério "não incide sobre a taxa de Delivery" deste ticket e foi recomendado não.

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) U1–U4 (Cupom inline no checkout, um erro específico por código, desconto fora da taxa de entrega) e §6 criar conta. Não adotar o lookup por telefone do print 17 (P-2.1; diverge da decisão 43). Pendentes: P-3.4 e P-7.1 em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-3.4 (endereços salvos na conta), P-CUP-1 (teto %), P-CUP-3 (dias da semana), P-CUP-5 (modelos), P-7.1 (sem vitrine); apoio ao P-2.1. Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): mantém magic link, vínculo e Cupom de boas-vindas; corta vários endereços salvos; Cupom mantém dias da semana.

- 2026-11-05 — Decisão [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md): login do Consumidor por código de 4 dígitos no WhatsApp (whatsmiau.dev), sem magic link; conta única Foode com CPF obrigatório e único; vínculo de Pedidos pelo telefone verificado na mesma Loja. Instância e secrets da whatsmiau ficam para o fim da implementação (erro controlado até lá).

- 2026-11-05 — Critérios consolidados com 63–65: magic link e vínculo por e-mail saem (65); entram código WhatsApp de 4 dígitos, CPF obrigatório e único, um telefone/CPF por conta, troca de número pelo Ops, vínculo por telefone verificado na mesma Loja, P-CUP-1, P-CUP-2, P-CUP-3, P-CUP-5, P-7.1; vários endereços salvos fora (64). Bloqueio passa a ser o 24a (o 24 foi dividido).

- 2026-11-05 — Decisão [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md): Cupom de boas-vindas é de primeira compra por Loja (Pedido Guest vinculado bloqueia; uso único por conta por Loja); conflito de conta orienta o suporte pelo widget de chat do Storefront quando ativo (sem canal enquanto desligado, risco aceito).

- 2026-11-05 — Decisão [68](../../../docs/decisoes/68-busca-telefone-com-conta.md): busca por telefone com conta usa o código do WhatsApp e os dados da conta.

- 2026-11-05 — Done (PR do 13). API `5e1935a`, UI `5fd1a0e`; migration `0006_conta_consumidor_cupons`. Login por WhatsApp fica indisponível (erro controlado) até o Dono conectar a whatsmiau no bloco final; `supportChatActive=false` até o widget (30). Oferta de criar conta pós-Pedido não feita (fora dos critérios).
