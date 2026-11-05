# Runbook — testes em produção (Ticket 30)

Passo a passo para o Dono da Foode testar o app de ponta a ponta com uma Loja real, depois do bloco humano final (chaves da AbacatePay, Efí, whatsmiau e Sentry gravadas). Painel: `https://admin.foodedelivery.com.br`. Storefront: `https://foodedelivery.com.br/loja/<slug>`.

Regras: use valores baixos (R$ 1 a R$ 5); nunca cole senha, chave, código do WhatsApp, CPF ou dado de cartão em issue, PR, chat ou log; nada aqui roda do notebook contra produção, só pelos workflows do GitHub.

## 0. Antes de começar

1. Conferir que a `master` está verde e o último deploy subiu:
   ```sh
   gh run list --workflow deploy.yml --limit 1
   gh run list --workflow e2e-producao.yml --limit 1
   ```
   O `e2e-producao` roda sozinho depois do deploy verde (Loja sintética `smoke-foode`, criada e limpa pelo próprio teste). Se estiver vermelho, abra com `gh run view <id> --log-failed` antes de seguir.
2. Migration pendente? Aplicar (dispara o deploy):
   ```sh
   gh workflow run db-migrate.yml --ref master -f confirmar=aplicar
   gh run watch "$(gh run list --workflow db-migrate.yml --limit 1 --json databaseId -q '.[0].databaseId')"
   ```
3. Verificar a configuração (secrets, Cron, D1, domínios, e-mail, webhooks e um evento de teste por DSN do Sentry):
   ```sh
   gh workflow run check-config.yml --ref master -f sentry=sim
   gh run watch "$(gh run list --workflow check-config.yml --limit 1 --json databaseId -q '.[0].databaseId')"
   ```
   Leia a tabela no resumo do job: **erro** bloqueia o teste; **faltando** é item do bloco humano (ex.: whatsmiau sem chave = login do Consumidor indisponível). Confira no Sentry que os três projetos (api, web, admin) receberam o evento de teste.
4. Webhook da AbacatePay (uma vez, depois das chaves gravadas e de um deploy com elas):
   ```sh
   gh workflow run setup-abacatepay-webhook.yml --ref master
   ```
5. (Opcional) Contas de teste `lojista@teste.com`/`operador@teste.com` e a Loja Piloto:
   ```sh
   gh workflow run contas-de-teste.yml --ref master -f confirmar=criar
   ```

## 1. Criar a Loja (como Ops)

1. Entrar no Painel com o e-mail Ops. Menu **Lojas** → **Nova Loja** (`/ops/nova`): Nome da Loja, CNPJ, WhatsApp da Loja, endereço, conta de repasse (Titular, CPF ou CNPJ do titular, Tipo da chave Pix, Chave Pix) e **E-mail do Dono**. **Cadastrar Loja** envia o convite.
2. **Taxas Foode** (`/ops/taxas`): conferir a tabela padrão para PIX, Cartão Normal e Cartão Rápido. Se a Loja tiver condição própria, cadastrar em **Lojas** → a Loja (`/ops/lojas/<id>`) → "Taxas Foode desta Loja". Sem taxa vigente o meio fica indisponível no checkout.
3. Na mesma tela da Loja: card **Plano** (faixa, Ciclo, "Vale a partir de" → **Ativar**) e **Modo do cartão** = **Normal (Efí)** para o primeiro teste de cartão.

## 2. Onboarding (como Dono)

1. Abrir o convite no e-mail, definir a senha em `/definir-senha` e entrar.
2. **Onboarding** (`/onboarding`): responder "Antes de começar, duas perguntas" (perfil) e seguir o checklist até "Sua Loja está pronta para receber Pedidos": Dados de contato, Horários, Entrega ou Retirada, Cardápio com item disponível, Plano ativo.
3. Vitrine: **Configurações → Dados da Loja** (`/configuracoes/loja`): logo, capa e contato. **Cardápio** (`/cardapio`): pelo menos um item barato e disponível.
4. **Configurações → Divulgação** (`/configuracoes/divulgacao`): **Link personalizado** (Slug), **Copiar link**, **Baixar QR Code (PNG)** e **Pixel Meta e Google** (ID do Pixel da Meta e ID da tag do Google, opcionais).
5. **Horários e Pausa** (`/configuracoes/horarios`): horário aberto agora. **Entrega** (`/configuracoes/entrega`): Retirada e Delivery por bairro ou Taxa fixa. **Bandeiras da maquininha** (`/configuracoes/pagamento`): Crédito/Débito aceitos na entrega. **Impressão** (`/configuracoes/impressao`): ligar **Imprimir ao aceitar**.
6. Como Ops, em `/ops/lojas/<id>` → "Estado da Loja" → **Ativar Loja**.
7. **Equipe** (`/equipe`): convidar um Operador (outro e-mail) para o passo 5.

## 3. Pedidos no Storefront (como Consumidor)

Abrir `https://foodedelivery.com.br/loja/<slug>` numa janela anônima, com o DevTools aberto na aba **Rede** (passo 7.4).

1. **Entrar com WhatsApp** (`/loja/<slug>/conta`): telefone real do teste → código recebido no WhatsApp → **Confirmar código**. Conferir o reenvio (30 s) e que um código errado mostra as tentativas restantes.
2. **Cupom**: como Dono, criar em **Cupons → Novo Cupom** (`/cupons/novo`) um código pequeno; no checkout, aplicar em "Código do cupom" e conferir que o desconto não vale para a taxa de entrega.
3. **PIX**: carrinho → `/loja/<slug>/finalizar` → **Pagar agora** → PIX → pagar o "PIX copia e cola" com valor baixo. A página do Pedido (`/loja/<slug>/pedido/<token>`) muda para pago.
4. **Cartão Normal (Efí)**: novo Pedido → **Pagar agora** → Cartão de crédito, cartão real de valor baixo. Aprovado = Pedido na fila.
5. **Cartão Rápido (AbacatePay)**: como Ops, trocar **Modo do cartão** da Loja para **Rápido (AbacatePay)**; novo Pedido com cartão real de valor baixo.
6. **Pagamento na entrega com troco**: novo Pedido → **Pagamento na entrega** → informar troco maior que o total.

## 4. Operar a fila (como Dono e como Operador)

1. **Pedidos** (`/`): na primeira visita, seguir o tour ("Os Pedidos novos chegam aqui", "Um botão, um destino", "Detalhe, impressão e WhatsApp"). Usar os chips Todos/Delivery/Retirada e conferir o som.
2. Aceitar um Pedido: com "Imprimir ao aceitar", a impressão abre sozinha; conferir o cupom (troco no Pedido na entrega). **Imprimir** no detalhe também.
3. No detalhe: **Avisar no WhatsApp** abre a conversa com o Consumidor com a mensagem do status.
4. Entrar como **Operador**: **Pausar Pedidos** → no Storefront, o checkout fica bloqueado ("Em pausa"); a faixa "Loja em Pausa — Retomar" mostra quem pausou → **Retomar**. Conferir que o Operador não vê Financeiro nem `/ops`.
5. Levar um Pedido até **Concluir**.

## 5. Cancelar com Estorno

1. No detalhe de um Pedido pago com cartão (um de cada modo): **Cancelar Pedido** → confirmar "A cobrança será cancelada."
2. O card ganha o selo "Estorno em andamento" e depois "Estorno concluído" (a reconciliação a cada 5 min também confere).
3. Conferir o estorno no painel do provedor (Efí para o Normal, AbacatePay para o Rápido) e, como Dono, em **Repasses** (`/repasses`), o lançamento anulado.
4. Cancelar o Pedido "Pagamento na entrega": sem Estorno.

## 6. Financeiro

1. **Relatórios** (`/relatorios`, só o Dono): trocar o período, **Exportar CSV** (sem nomes de clientes, sem telefone/CPF/endereço) e **Imprimir** (o TOP 10 clientes **não** sai na impressão). Conferir o Funil de conversão.
2. **Repasses** (`/repasses`): Próximo lote, totais por status e Lotes pagos. **Plano** (`/plano`): faixa atual e Pedidos do mês.
3. Como Ops, **Repasses de hoje** (`/ops/repasses`): na Loja, **Marcar lote pago** → Data do Pix, Identificador ou comprovante do Pix, Conta de saída, Custo do envio → "Confira antes de confirmar" → **Confirmar lote pago**. O lote aparece em "Lotes pagos" no `/repasses` do Dono.
4. **Margem** (`/ops/margem`): margem por Loja no período, com Taxa Foode e custos dos provedores (**Custos dos provedores**, `/ops/custos`; conferir o custo do envio de repasse da Efí, 1,19%, da decisão 76).

## 7. Segurança dos dados depois do teste

1. **Workers Logs** (dashboard da Cloudflare → Workers → `foode-api`, `foode-web`, `foode-admin` → Logs), janela do teste: buscar o telefone usado, o CPF, o e-mail, a rua do endereço, os 4 últimos dígitos do cartão, `webhookSecret`, `token=` e trechos de corpo de webhook. **Nada pode aparecer.** Exceção conhecida: o token do Pedido no caminho das requests do Storefront (pendência R3, decisão do Dono).
2. **Sentry** (projetos api, web, admin): mesmas buscas nos eventos e breadcrumbs. URLs devem aparecer como `/pedido/:token`, `/definir-senha` sem query e `/reset-password/:token`.
3. Registrar o resultado no `reports/30-seguranca-dados.md` (item 18), sem copiar nenhum dado real.
4. **Pixel**: com a aba Rede filtrada por `facebook` e `google`, abrir a página do Pedido (`/loja/<slug>/pedido/<token>`): nenhuma request para Meta/Google pode levar `/pedido/<token>` na URL, no `dl`/`page_location` nem no referrer.
5. **Loja sintética**: `smoke-foode` ("Loja Smoke (teste automático)") aparece no `/ops` como "Sem Plano"; é esperado, não mexer.

## 8. Fim

1. Rodar de novo `check-config.yml` (sem `-f sentry=sim`) e conferir o último `e2e-producao` verde.
2. Desativar ou manter a Loja de teste; os Pedidos de teste ficam no histórico.
3. Mandar ao orquestrador só "feito" ou o que falhou (passo e mensagem da tela), sem dados pessoais.
