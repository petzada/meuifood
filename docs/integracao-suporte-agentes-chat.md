# Integração do suporte: widget do agentes.chat + MCP

**Ticket 30** · decisões [63](decisoes/63-decisoes-ux-benchmark-anota.md) (P-ONB-5), [64](decisoes/64-revisao-adversarial-escopo-mvp.md), [65](decisoes/65-login-consumidor-codigo-whatsapp.md), [66](decisoes/66-esclarecimentos-consolidacao-v3.md) (C2)

O suporte da Foode é **um chat automatizado**: um agente do agentes.chat responde no Painel (Dono e Operador) e no Storefront (Consumidor), com uma base de conhecimento da Foode e, depois do lançamento, ferramentas por MCP. **Sem link `wa.me` de suporte** (64). No MVP existe só o espaço do widget, desligado sem configuração. O agente, a base de conhecimento e o MCP são trabalho **pós-lançamento**.

## 1. O que já existe na codebase

| Peça | Onde | Comportamento |
| --- | --- | --- |
| Contrato de configuração | `packages/shared/src/support-widget.ts` (`supportWidgetConfig`) | Valida as duas variáveis; qualquer uma ausente ou inválida = desligado. Recusa `http:`, URL com usuário/senha, id fora de `[A-Za-z0-9_-]{1,128}` e qualquer host do WhatsApp (`wa.me`, `*.whatsapp.com`). |
| Montagem no Storefront | `apps/web/src/components/support-widget.tsx`, no layout raiz (`apps/web/src/app/layout.tsx`) | `<script>` do carregador com `strategy="lazyOnload"`, `data-widget-id` e `data-foode-surface="storefront"`. Nunca em `/loja/{slug}/pedido/{token}`: o token na URL dá acesso ao Pedido e um script de terceiro poderia ler essa URL. |
| Montagem no Painel | `apps/admin/src/components/support-widget.tsx`, no layout raiz (`apps/admin/src/app/layout.tsx`) | O mesmo `<script>`, com `data-foode-surface="painel"`. Nunca em `/definir-senha`, porque o token de convite ou de redefinição de senha está na URL. |
| Conflito de conta (Ticket 13) | `customerErrorMessagePt` (`packages/shared/src/customer/login.ts`) + `LoginFlow` (`apps/web/.../conta/login-flow.tsx`) | Com o widget ativo na página: "Não foi possível concluir o cadastro. Fale com o suporte Foode pelo chat." Desligado: "Não foi possível concluir o cadastro." Testes cobrem os dois casos. |

Sem configuração, nada carrega e nada aparece. A página não ganha `<script>`, espaço vazio nem botão.

## 2. Configuração (contrato)

As variáveis são **públicas** e não são segredo: vão para o navegador. Entram no **build** do Next de cada app (`NEXT_PUBLIC_*` é embutido no bundle), então cada app liga ou desliga o widget separadamente:

| Variável | Exemplo | Para que serve |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPPORT_WIDGET_SRC` | `https://<cdn do agentes.chat>/loader.js` | URL `https://` do script carregador do widget. |
| `NEXT_PUBLIC_SUPPORT_WIDGET_ID` | `foode-suporte` | Id público do widget ou agente no agentes.chat. O script o recebe em `data-widget-id`. |

Para ligar o widget (bloco humano final do Ticket 30, depois que o Dono decidir):

1. Criar o widget no agentes.chat e anotar a URL do carregador e o id público.
2. Gravar as duas variáveis como GitHub **variables** (não secrets): `SUPPORT_WIDGET_SRC` e `SUPPORT_WIDGET_ID` ligam os dois apps; `SUPPORT_WIDGET_SRC_WEB`/`SUPPORT_WIDGET_ID_WEB` e `SUPPORT_WIDGET_SRC_ADMIN`/`SUPPORT_WIDGET_ID_ADMIN` sobrescrevem por app (para ligar só um dos lados, grave só as do app). Ex.: `gh variable set SUPPORT_WIDGET_SRC --body "https://…/loader.js"`.
3. O `deploy.yml` repassa essas variables como `NEXT_PUBLIC_SUPPORT_WIDGET_SRC`/`_ID` no build OpenNext de `apps/web` e de `apps/admin` (um passo de build por app), no mesmo molde de `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Redeploy pelo CI. Para desligar, apague as variables e faça outro redeploy.

Se o carregador do agentes.chat esperar outro formato de embed (outro atributo, um `init(...)` inline), ajuste só os dois componentes de montagem. O contrato das variáveis continua o mesmo.

## 3. O que o agente do agentes.chat precisa

### 3.1 Base de conhecimento (conteúdo de ajuda)

Gerar a partir da codebase e dos documentos canônicos. **Nunca a partir de dados do banco.**

- **Glossário e regras do produto:** `CONTEXT.md` (glossário raiz), `docs/decisoes/*` (principalmente 43, 63–76) e a spec do MVP. Termos: Loja, Dono, Operador, Consumidor, Pedido, Cardápio, Fulfillment, Pausa, Repasse, Cupom.
- **Painel (Dono/Operador):** onboarding (perfil, checklist, vitrine, Slug, QR, Pixel), horários, entrega por bairro ou taxa fixa, bandeiras, "Imprimir ao aceitar", fila de Pedidos (chips, Pausa, "Avisar no WhatsApp", impressão), Cardápio, Cupons, Equipe, Plano/relatórios/Repasses (Ticket 14) e as taxas Foode por meio de pagamento.
- **Storefront (Consumidor):** como pedir, meios de pagamento (PIX, Cartão, na entrega com troco), tarifa de serviço do pagamento online, página do Pedido, login por código no WhatsApp (4 dígitos, 5 min, 5 tentativas, reenvio em 30 s), CPF obrigatório na conta, Cupom de boas-vindas.
- **Mensagens de erro do produto:** a fonte são as funções `*MessagePt` de `packages/shared` (ex.: `customerErrorMessagePt`, `checkoutErrorMessagePt`). Cada mensagem deve ter a explicação do que fazer.
- O roteiro de `docs/runbook-testes-producao.md` (Ticket 30, quando existir) serve de base para os passo a passos.

### 3.2 Critérios de resposta

- Responder só sobre a Foode e o uso do produto, em PT-BR, curto e com o próximo passo concreto.
- Nunca prometer prazo de Repasse, Estorno ou liberação além do que o produto mostra. Para valores e datas, mandar a pessoa à tela certa (Repasses, página do Pedido).
- Nunca pedir senha, código do WhatsApp, número de cartão, CVV, CPF completo, token ou link da página do Pedido. Se a pessoa colar um desses dados, não repetir e orientar a apagar.
- Dúvida sobre um Pedido específico: o Consumidor fala com a **Loja** (WhatsApp da Loja na página do Pedido). A Foode não opera a cozinha nem a entrega.
- Não diagnosticar fraude nem acusar ninguém. Pagamento recusado tem as mensagens do produto.

### 3.3 Escalada ao Dono da Foode (humano)

Escalar, com um resumo **sem dado pessoal além do necessário**, quando:

- **conflito de telefone/CPF** (Ticket 13/65): o Consumidor não consegue criar a conta. A troca de telefone é só pelo Ops (`/ops`, auditada). O agente coleta o contato para retorno, mas não confirma nem nega se aquele telefone ou CPF tem conta;
- houver divergência de dinheiro (Repasse, Estorno, cobrança em dobro, tarifa);
- houver suspeita de incidente de segurança ou de dados (LGPD: pedido de acesso, correção ou exclusão de dados);
- a Loja estiver bloqueada ou suspensa, ou houver problema no onboarding que o agente não resolve;
- a pessoa pedir um humano.

Canal de escalada: definir com o Dono (e-mail da Foode ou fila do agentes.chat). **Nunca `wa.me` publicado no widget.**

### 3.4 Dados que NUNCA podem ser expostos (ao agente, à base ou ao MCP)

- Telefone, CPF, e-mail, endereço e nome de Consumidor de qualquer Loja. O TOP 10 do Ticket 14 também fica fora.
- Código do WhatsApp, tokens de sessão, token da página do Pedido (`/pedido/{token}`), token de convite ou redefinição de senha, cookies.
- Dados de cartão (o servidor nunca os tem), token do SDK do cartão, chaves PIX das Lojas, dados bancários.
- Segredos e configuração: `BETTER_AUTH_SECRET`, `ORDER_TOKEN_SECRET`, `PHONE_LOOKUP_IP_SALT`, chaves Efí/AbacatePay/whatsmiau/MillionSend/Turnstile, DSNs do Sentry, corpos de webhook, URLs com segredo.
- Dados de outra Loja: o agente atende uma Loja por vez e nunca cruza dados entre Lojas.
- O WhatsApp de vendas da Foode (`SALES_WHATSAPP`), que é só do `/falar` da landing.

## 4. MCP (pós-lançamento)

O MCP dá ao agente ferramentas **só de leitura** e com escopo. Proposta:

| Ferramenta | Quem pode | Retorna | Nunca retorna |
| --- | --- | --- | --- |
| `status_da_plataforma` | todos | `/health` da api e status dos provedores (PIX, Cartão, WhatsApp) | detalhes de erro e corpos |
| `ajuda_buscar` | todos | trechos da base de conhecimento | — |
| `loja_estado` | Dono/Operador autenticado na própria Loja | aberta/fechada/Pausa, checklist do onboarding, meios ativos | dados de Consumidor |
| `pedido_status` | Dono/Operador da Loja (por código do Pedido) | status, horários, meio, totais | telefone, endereço, CPF, token |
| `repasse_resumo` | Dono | próximos Repasses e lotes (valores e datas) | chave PIX, dados bancários |

Requisitos:

- **Autenticação e escopo:** o widget no Painel repassa ao agente uma identidade assinada pelo servidor (ex.: JWT curto emitido pelo admin com `userId`, `storeId` e papel). O MCP valida essa identidade e só consulta a api por RPC com `StoreContext` (a mesma regra de `packages/db`). No Storefront o agente não tem ferramenta de dados: só a base de conhecimento.
- O MCP **não acessa o D1 direto**. Usa uma interface própria da api, com a mesma política de papéis (`packages/shared/src/auth/policy.ts`) e auditoria (`audit_events`) de cada consulta.
- Rate limit por sessão do widget e log sem dado pessoal, no mesmo padrão dos logs JSON da api.
- Nenhuma ferramenta de escrita no MVP do suporte (nada de cancelar Pedido, trocar telefone ou mexer em Repasse). A escrita fica com o humano no `/ops`.

## 5. Riscos e pendências

- **Widget desligado = Consumidor bloqueado por conflito de telefone/CPF sem canal de suporte.** Risco aceito na 66 até o widget ser ativado (bloco humano final do Ticket 30).
- Antes de ativar: confirmar com o agentes.chat o formato do embed, o que o script coleta (URL da página, cookies, IP) e a retenção. A política de privacidade (`/privacidade`) precisa citar o agentes.chat como operador.
- Se o agentes.chat exigir CSP ou domínio liberado, ajustar quando for ativar (hoje os apps não definem CSP).
