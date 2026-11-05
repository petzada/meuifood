# 65 — Login do Consumidor por código no WhatsApp

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Altera:** [43](43-guest-conta-vinculo-pedido.md) (vínculo), [64](64-revisao-adversarial-escopo-mvp.md) (conta do Ticket 13), spec (magic link por e-mail)

## Decisão

- **Consumidor entra só por código no WhatsApp**, no estilo do ceremony (`lib/auth/whatsapp-login-core.ts`, `lib/whatsapp/whatsmiau.ts` no repositório ceremony). Sem magic link por e-mail. **Dono, Operador e Ops continuam com e-mail e senha** ([22](../../.scratch/mvp-foode-delivery/issues/22-auth-better-auth-rbac.md)).
- Mensagem: `XXXX é o seu código de acesso ao Foode Delivery.`, enviada pela API **whatsmiau.dev** a partir do número oficial da Foode.
- Código: **4 dígitos**, validade **5 min**, **5 tentativas**, reenvio após **30 s**; rate limit por telefone e por IP + Turnstile; código guardado com hash e de uso único.
- **Conta única na Foode, dados por Loja:** o mesmo login vale em qualquer Loja; Pedidos, Cupom de boas-vindas e histórico ficam separados por Loja.
- **CPF obrigatório e único na criação da conta** (após o primeiro código: nome + CPF validado). Guest continua pedindo só com nome e telefone.
- **Um telefone = uma conta; um CPF = uma conta.** Conflito bloqueia e orienta o suporte Foode; troca de número só pelo Ops, auditada.
- **Vínculo de Pedidos Guest pelo telefone verificado, na mesma Loja**; o e-mail deixa de ser exigido (altera a 43). Nada atravessa Lojas.
- A busca de dados pelo telefone no checkout (63, P-2.1) **continua sem código**, com máscara e confirmação.

## Operação

- O Dono conecta o número oficial na instância da whatsmiau.dev; o orquestrador grava chave e id da instância como secrets do GitHub → Worker.
- **Esse passo humano fica para o fim de toda a implementação** (antes do Ticket 30). Até lá o login do Consumidor responde com erro controlado ("Login pelo WhatsApp indisponível no momento") e o checkout Guest segue funcionando.
