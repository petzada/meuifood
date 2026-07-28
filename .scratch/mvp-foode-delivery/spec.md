# MVP Foode Delivery

Status: ready-for-agent

## Problem Statement

O Comerciante de uma PME que já opera delivery precisa reduzir dependência e custo de marketplaces sem depender de uma nova praça de descoberta. Ele já traz o Consumidor por WhatsApp, Instagram, QR Code, atendimento local e recorrência, mas precisa de um Canal próprio que reúna Cardápio, checkout, Pedido, pagamento online e gestão diária com custo previsível, sem comissão de marketplace.

O Dono precisa configurar a Loja e acompanhar sua operação e suas informações financeiras. O Operador precisa trabalhar exclusivamente com Pedidos e mudanças de status, sem acesso a Cardápio, horários, Delivery, relatórios, Plano, equipe ou incentivos. O Consumidor precisa pedir pelo navegador do celular sem instalar aplicativo nem ser obrigado a criar conta.

O piloto precisa validar a operação ponta a ponta com um único Comerciante-modelo. Pagamentos online ficam temporariamente sob `pilot_platform`, com Ledger de repasse auditável, sem generalizar custódia no MEI e sem misturar o futuro onboarding `baas` ao caminho feliz do piloto.

## Solution

Entregar o Foode Delivery como SaaS web mobile-first de Canal próprio. Cada Loja representa um CNPJ e um tenant isolado por `store_id`, possui Slug globalmente único e publica seu Storefront em `/loja/[slug]`. A Loja traz o Consumidor por link, QR Code e `wa.me`; não existe praça multi-Loja nem comissão de marketplace.

O Storefront reúne Cardápio, carrinho, Fulfillment e checkout. O Consumidor pode concluir como Guest ou com conta, escolher Delivery ou Retirada quando disponível e pagar por PIX, Crédito online à vista ou Pagamento na entrega. Loja fora do horário ou em Pausa mantém o Cardápio visível, mas bloqueia o checkout.

O Painel permite ao Dono gerenciar Cardápio, funcionamento, Pausa, Delivery, Retirada, equipe, Cupom de boas-vindas e Plano, além de operar Pedidos. O Operador acessa somente Pedidos e mudanças de status. A fila atualiza por polling HTTP a cada 10 segundos e emite som uma única vez ao detectar Pedido novo.

A API é a fonte de verdade de Pedido, autorização, pagamento, webhook, Estorno, Ledger de repasse e reconciliação. PIX usa Woovi; Crédito online usa Asaas. O piloto opera somente com o Comerciante-modelo em `pilot_platform`. `baas` permanece uma aresta pós-piloto validado, LTDA e homologação; `merchant_own_account` permanece apenas como valor do enum.

O produto oferece uma única assinatura Foode: R$ 179 por mês ou R$ 1.718,40 por ano, com 20% OFF. O teto de R$ 15 mil de GMV online é somente âncora comercial fora do produto. O Painel mostra o Plano de forma read-only e sua ativação ocorre por flag de ops após pagamento externo.

## User Stories

1. Como Comerciante, quero operar um Canal próprio, para reduzir minha dependência de marketplaces sem precisar de uma nova praça de descoberta.
2. Como Comerciante, quero pagar R$ 179 por mês ou R$ 1.718,40 por ano, para ter custo previsível sem comissão de marketplace.
3. Como Dono, quero aceitar um convite e entrar com e-mail e senha, para acessar o Painel da minha Loja.
4. Como Dono, quero escolher um Slug globalmente único, para publicar minha Loja em `/loja/[slug]`.
5. Como Dono, quero que Slugs inválidos, reservados ou já usados sejam recusados, para não colidir com outra Loja ou rota do produto.
6. Como Dono, quero copiar o link da Loja e obter um QR Code, para divulgar meu Canal próprio.
7. Como Dono, quero criar, editar, ordenar e remover categorias, para organizar o Cardápio.
8. Como Dono, quero criar e editar itens com nome, preço, foto e descrição, para apresentar minha oferta.
9. Como Dono, quero ligar ou desligar a disponibilidade de um item, para refletir o que pode ser pedido.
10. Como Dono, quero configurar Complementos obrigatórios ou opcionais, para registrar escolhas do Consumidor.
11. Como Dono, quero configurar Adicionais com preço, para oferecer acréscimos no Pedido.
12. Como Dono, quero definir horários de funcionamento, para permitir checkout somente quando a Loja estiver operando.
13. Como Dono, quero ativar a Pausa, para bloquear o checkout imediatamente sem alterar os horários.
14. Como Dono, quero manter o Cardápio visível fora do horário ou durante a Pausa, para preservar o acesso à oferta.
15. Como Dono, quero escolher exatamente um modo de taxa de Delivery, por bairro ou Taxa fixa, para refletir minha operação.
16. Como Dono, quero cadastrar bairros e seus valores, para atender apenas as regiões configuradas.
17. Como Dono, quero configurar uma Taxa fixa, para aplicar o mesmo valor de Delivery à área atendida.
18. Como Dono, quero ativar ou desativar a Retirada, para oferecê-la apenas quando fizer sentido.
19. Como Dono, quero ver a fila de Pedidos da Loja, para acompanhar a operação diária.
20. Como Dono, quero ver itens, Complementos, Adicionais, Fulfillment, pagamento e dados necessários do Pedido, para prepará-lo corretamente.
21. Como Dono, quero mover um Pedido recebido para Em preparo, para registrar o início da operação.
22. Como Dono, quero marcar um Pedido de Delivery como Saiu para entrega, para refletir sua etapa.
23. Como Dono, quero marcar um Pedido de Retirada como Pronto para retirada, para refletir sua etapa.
24. Como Dono, quero concluir manualmente um Pedido, para fechar seu ciclo após o atendimento.
25. Como Dono, quero cancelar um Pedido, para encerrar um atendimento que não seguirá.
26. Como Dono, quero que cancelar PIX ou Crédito online já pago dispare Estorno automático total, para não depender de uma ação separada no gateway.
27. Como Dono, quero ver o Estorno em andamento, concluído ou falho, para acompanhar o resultado financeiro do cancelamento.
28. Como Dono, quero que cancelar Pagamento na entrega altere apenas o Pedido, para não criar um Estorno inexistente.
29. Como Dono, quero consultar relatórios básicos de Pedidos e do Canal próprio, para acompanhar a Loja sem expor esses dados ao Operador.
30. Como Dono do Comerciante-modelo, quero consultar o Ledger de repasse, para relacionar Pedido, cobrança, líquido, previsão e pagamento efetivo.
31. Como Dono, quero ver as opções mensal e anual do Plano, para entender o produto contratado.
32. Como Dono, quero ver o Plano como informação read-only, para não confundir o MVP com cobrança self-serve.
33. Como Dono, quero operar após ativação do Plano por flag de ops, para respeitar o onboarding assistido do piloto.
34. Como Dono, quero convidar Operadores por e-mail, para dividir a operação de Pedidos.
35. Como Dono, quero remover um Operador, para controlar quem acessa os Pedidos da Loja.
36. Como Dono, quero que o Operador não acesse Cardápio, funcionamento, Delivery, relatórios, Plano, equipe ou Cupom de boas-vindas, para separar operação de configuração e finanças.
37. Como Dono, quero ligar ou desligar o Cupom de boas-vindas, para decidir se a criação de conta terá incentivo.
38. Como Dono, quero configurar o Cupom de boas-vindas em R$ ou %, para adequá-lo à Loja.
39. Como Operador, quero entrar com e-mail e senha, para acessar a operação da Loja para a qual fui convidado.
40. Como Operador, quero acessar somente a fila de Pedidos da minha Loja, para trabalhar sem ver áreas restritas.
41. Como Operador, quero abrir os detalhes de um Pedido, para saber itens, escolhas, Fulfillment e pagamento necessários à operação.
42. Como Operador, quero mover um Pedido para Em preparo, para registrar o início do atendimento.
43. Como Operador, quero marcar um Pedido de Delivery como Saiu para entrega, para atualizar a etapa correspondente.
44. Como Operador, quero marcar um Pedido de Retirada como Pronto para retirada, para atualizar a etapa correspondente.
45. Como Operador, quero concluir manualmente um Pedido, para fechar seu ciclo depois do atendimento.
46. Como Operador, quero cancelar um Pedido, para interromper o atendimento quando necessário.
47. Como Operador, quero ver o andamento do Estorno disparado pelo cancelamento, para comunicar corretamente o resultado ao Consumidor.
48. Como Operador, quero permanecer sem acesso a configurações e informações financeiras, para atuar somente sobre Pedidos e status.
49. Como Dono ou Operador, quero que a fila consulte novos Pedidos a cada 10 segundos, para acompanhar a operação sem atualização manual.
50. Como Dono ou Operador, quero ouvir um som uma única vez quando surgir Pedido novo, para perceber a nova demanda sem alertas repetidos.
51. Como Consumidor, quero acessar uma Loja diretamente por link ou QR Code, para chegar ao Cardápio correto.
52. Como Consumidor, quero usar o Storefront no navegador do celular, para pedir sem instalar aplicativo.
53. Como Consumidor, quero navegar pelas categorias e ver nome, preço, foto e descrição dos itens, para escolher o que pedir.
54. Como Consumidor, quero ver apenas itens disponíveis para compra, para não montar um Pedido inviável.
55. Como Consumidor, quero selecionar os Complementos exigidos ou permitidos, para personalizar o item.
56. Como Consumidor, quero adicionar Adicionais e ver seu impacto no total, para confirmar o valor antes do checkout.
57. Como Consumidor, quero revisar itens, escolhas, quantidades e total no carrinho, para corrigir o Pedido antes de concluir.
58. Como Consumidor, quero ver o Cardápio quando a Loja estiver fora do horário, para conhecer a oferta.
59. Como Consumidor, quero ver o motivo e o próximo horário de abertura quando a Loja estiver fechada, para entender o bloqueio do checkout.
60. Como Consumidor, quero ver uma mensagem distinta quando a Loja estiver em Pausa, para não confundir Pausa com horário.
61. Como Consumidor, quero escolher Delivery ou Retirada apenas quando cada opção estiver disponível, para usar um Fulfillment válido.
62. Como Consumidor, quero informar endereço para Delivery, para validar atendimento e taxa.
63. Como Consumidor, quero ver a taxa por bairro ou Taxa fixa antes de confirmar, para conhecer o total completo.
64. Como Consumidor, quero ser impedido de escolher Delivery fora dos bairros atendidos, para não concluir um Pedido inviável.
65. Como Consumidor, quero escolher Retirada quando não houver Delivery para meu endereço e a opção estiver ativa, para ainda concluir o Pedido.
66. Como Consumidor, quero pagar por PIX, para concluir o pagamento online pela Woovi.
67. Como Consumidor, quero pagar por Crédito online à vista, para concluir o pagamento pelo Asaas.
68. Como Consumidor, quero escolher Pagamento na entrega, para pagar diretamente ao Comerciante por dinheiro ou maquininha.
69. Como Consumidor, quero que retries técnicos não criem duas cobranças, para não pagar duas vezes pelo mesmo Pedido.
70. Como Consumidor, quero receber confirmação com número e resumo do Pedido, para saber que a Loja o recebeu.
71. Como Consumidor, quero acompanhar o status do Pedido no Canal próprio, para saber sua etapa atual.
72. Como Consumidor, quero abrir o WhatsApp do Comerciante por `wa.me`, para falar com a Loja sem integração de bot.
73. Como Consumidor, quero criar conta e entrar por magic link, para acessar meus Pedidos sem cadastrar senha.
74. Como Consumidor com conta, quero concluir novos Pedidos autenticado, para vinculá-los à minha conta.
75. Como Consumidor, quero receber o Cupom de boas-vindas quando criar conta e a Loja tiver ativado o programa, para usar o incentivo oferecido.
76. Como Guest, quero concluir meu primeiro Pedido sem criar conta, para evitar atrito no checkout.
77. Como Guest, quero informar nome e telefone, além do endereço somente para Delivery, para fornecer os dados mínimos necessários.
78. Como Guest, quero concluir Retirada sem informar endereço, para não fornecer dado desnecessário.
79. Como Guest, quero concluir o Pedido sem informar e-mail, para manter a criação de conta opcional.
80. Como Guest, quero usar PIX, Crédito online ou Pagamento na entrega, para ter os mesmos meios disponíveis a uma conta.
81. Como Guest, quero criar conta após o Pedido, para decidir sem bloquear a compra já concluída.
82. Como Guest, quero informar e-mail e confirmar o telefone do Pedido, para receber o magic link e comprovar o vínculo.
83. Como Guest, quero vincular o Pedido recém-concluído à nova conta, para acessá-lo depois da conversão.
84. Como Guest, quero que Pedidos elegíveis da mesma Loja e telefone possam ser vinculados, para recuperar meu histórico sem atravessar Lojas.
85. Como Comerciante-modelo, quero que cada pagamento online pago gere obrigação rastreável no Ledger de repasse, para conferir o dinheiro devido.
86. Como Comerciante-modelo, quero ver o líquido e a data prevista de repasse, para planejar meu caixa.
87. Como Comerciante-modelo, quero que a data prevista seja distinta da data efetivamente paga, para não tratar previsão como repasse concluído.
88. Como Comerciante-modelo, quero preservar o histórico do Ledger após a migração futura para `baas`, para manter a prestação de contas do piloto.
89. Como responsável pela operação Foode, quero registrar o pagamento efetivo do repasse, para manter trilha auditável da custódia temporária.
90. Como responsável pela operação Foode, quero reconciliar cobranças, liquidações, Estornos e repasses, para detectar eventos perdidos e divergências.
91. Como responsável pela operação Foode, quero que webhooks repetidos ou fora de ordem não dupliquem efeitos nem façam estados regredirem, para suportar entrega `at-least-once`.
92. Como responsável pela operação Foode, quero ser alertado quando cobrança, Estorno ou reconciliação falhar, para tratar exceções sem tornar a operação manual o caminho feliz.
93. Como responsável pela operação Foode, quero manter somente o Comerciante-modelo em `pilot_platform`, para não escalar a custódia no MEI.
94. Como responsável pela operação Foode, quero declarar manualmente o piloto validado, sem gate automático de GMV, Pedidos ou calendário, para decidir quando abrir a LTDA.
95. Como responsável pela operação Foode, quero iniciar a homologação BaaS somente depois da LTDA, para respeitar o caminho comercial e de compliance decidido.
96. Como responsável pela operação Foode, quero migrar o Comerciante-modelo para `baas` após homologação, para encerrar a custódia e o repasse pelo MEI.
97. Como responsável pela operação Foode, quero que novos Comerciantes só sejam ativados em `baas`, para operar um único modelo pós-homologação.
98. Como responsável pela operação Foode, quero que `merchant_own_account` permaneça sem UI ou fallback, para não transformá-lo em contingência comercial.

## Implementation Decisions

- O MVP é um monorepo TypeScript com pnpm workspaces, três apps — Storefront, Painel e API — e packages compartilhados para banco, contratos/tokens e primitives de UI.
- Storefront e Painel usam Next.js App Router, React, Tailwind e shadcn seletivo. A API usa Fastify, REST/JSON e Zod e concentra mutações e regras de domínio.
- Marketing institucional compartilha o Storefront; não existe quarto app de landing.
- Railway hospeda os três apps. GitHub Actions executa lint, typecheck, testes e validação de migrations antes de produção. Não existe staging ou preview no MVP.
- Railway Cron executa reconciliação short-lived reutilizando a responsabilidade da API; não existe worker sempre-on nem quarto app.
- Supabase fornece Postgres, Auth, RLS e backup do plano contratado. Imagens do Cardápio usam Cloudflare R2 (não Supabase Storage). Prisma é o ORM e owner do schema e das migrations.
- Loja é o tenant. `store_id` é a FK canônica em todas as tabelas de negócio. Não existem Workspace, `workspace_id` ou `merchant_id` como tenant.
- RLS impede acesso entre Lojas. A API estabelece contexto confiável por request com uma role sujeita às policies. Role privilegiada é restrita a migrations, tarefas administrativas e bypass consciente.
- RBAC na API separa Dono e Operador. Ocultar controles no Painel não substitui autorização no servidor.
- Dono e Operador usam Supabase Auth com e-mail e senha e entram por convite. Consumidor usa magic link; Guest não usa Auth.
- O Storefront resolve a Loja pelo Slug, obtém o Cardápio público e nunca aceita `store_id` arbitrário do navegador como fonte de tenant.
- O Cardápio contém categorias, itens, imagens, disponibilidade, Complementos e Adicionais. Imagens usam Cloudflare R2 com autorização compatível com `store_id` e RBAC (PUT pré-assinado na API; leitura pública via base URL/CDN).
- Loja fora do horário e Pausa são estados distintos. Ambos mantêm o Cardápio visível e bloqueiam a criação de Pedido; não existe agendamento.
- Fulfillment é Delivery ou Retirada opcional. Cada Loja escolhe taxa por bairro ou Taxa fixa, nunca os dois modos simultaneamente. Distância/km não entra.
- O servidor recalcula preços, escolhas e taxa de Delivery; totais enviados pelo navegador não são fonte de verdade.
- O checkout aceita exclusivamente `pix`, `credit` e `on_delivery`. Débito e Voucher não aparecem como flags inativas ou alternativas escondidas.
- Pagamento na entrega não cria cobrança, taxa online, lançamento de gateway ou entrada no GMV online.
- O Pedido preserva um snapshot dos dados mínimos do Guest. O vínculo posterior à conta usa e-mail, confirmação do telefone e `order_id`, sem recriar ou apagar o Pedido e sem atravessar Loja.
- O Cupom de boas-vindas é opt-in do Dono, em R$ ou %, e é oferecido no fluxo de criação de conta. Fidelidade por quantidade de Pedidos não entra.
- O Painel consulta Pedidos por polling HTTP a cada 10 segundos. O som é emitido uma vez para um Pedido realmente novo e não transforma estado local em fonte de verdade.
- O ciclo de Pedido usa estados enxutos e transições compatíveis com Delivery ou Retirada. Conclusão é manual.
- Cancelar Pedido já pago por PIX ou Crédito online registra o cancelamento e dispara Estorno automático total no provider correto. Cancelar Pagamento na entrega altera somente o Pedido.
- Pedido cancelado e estado de Estorno são observáveis separadamente. Falha do provider não desfaz o cancelamento nem elimina a obrigação de devolução.
- Pagamentos são implementados na API por providers: Woovi para PIX e Asaas para Crédito online. Woovi usa o SDK oficial; Asaas usa `fetch` com validação Zod.
- Cada Loja possui Modo de cobrança `pilot_platform`, `baas` ou `merchant_own_account`. O checkout escolhe provider e credenciais pela configuração protegida da Loja sem expor custódia ao Storefront.
- O dia 1 executa somente `pilot_platform` para o Comerciante-modelo, com secrets do MEI em variáveis Railway e nenhuma UI de conexão de gateway.
- PIX aplica a condição comercial de 1,19% com D+1. Crédito à vista aplica 3,29% mais R$ 0,79 com D+33. Datas previstas devem preferir a informação retornada pelo provider em vez de reinterpretar dias úteis no produto.
- Valores monetários são persistidos em centavos e calculados deterministicamente, sem ponto flutuante ou locale implícito. O arredondamento ocorre uma vez no resultado monetário da cobrança, conforme contrato fechado nos testes do helper.
- Criação de cobrança, cancelamento, Estorno e webhook usam chaves idempotentes estáveis. Retentar a mesma intenção não cria outro efeito lógico.
- Webhooks Woovi e Asaas possuem endpoints separados, verificam autenticidade, persistem identidade única do evento e aceitam entrega `at-least-once` sem regressão de estado.
- O Ledger de repasse é obrigatório em `pilot_platform` e relaciona Pedido, cobrança, provider, total pago, taxa comercial, líquido, data prevista e data efetivamente paga. Histórico não é apagado por Estorno.
- A confirmação de que o repasse ao Comerciante-modelo foi efetivamente pago é uma ação assistida de ops no piloto; não se modela extrato bancário como Ledger.
- Reconciliação consulta cobranças, Estornos e obrigações pendentes e reaplica as mesmas transições idempotentes dos webhooks. Pagamento tardio de Pedido cancelado converge para Estorno total.
- Sentry entra nos três apps desde o bootstrap. Logs usam stdout Railway e não incluem secrets, dados de cartão ou dados pessoais desnecessários.
- A UI usa Primary Foode `#F35050`, accent escasso `#FFB800`, Nunito e containers outline com borda fina, sem fill e sem shadow. O asset do logo pode preservar sua sombra própria.
- Tokens de marca vêm da identidade Foode. A referência de design fornece apenas densidade, spacing, canvas/ink, radii e hierarquia modesta; Rausch e componentes Airbnb não entram.
- A Mensalidade é ativada por flag de ops após pagamento externo. O Painel é read-only para cobrança, e o teto de GMV não aparece como meter, bloqueio ou cobrança automática.
- O GMV conta somente Pedidos Concluídos pagos online e inclui itens, Adicionais e taxa de Delivery. Exclui Pedidos cancelados e Pagamento na entrega.
- `baas` entra somente após piloto validado manualmente, abertura da LTDA e homologação. O onboarding de subconta no Painel é uma fase futura bloqueada, não parte do aceite do piloto.
- `merchant_own_account` permanece somente no enum, sem UI, credenciais de Comerciante ou comportamento de fallback.

## Testing Decisions

- Testes verificam comportamento externo, contratos HTTP, autorização, estado persistido e efeitos financeiros; não fixam organização interna, quantidade de queries, nomes de funções ou classes CSS.
- Como não existe implementação anterior, estas seams inauguram o padrão do repositório. Não há prior art de testes a imitar.
- **Seam 1 — API HTTP com Postgres/RLS reais:** exercitar Fastify pela interface HTTP com migrations aplicadas via Supabase CLI, constraints, transactions e policies no Supabase de produção. Fixtures de teste devem ter identificadores sintéticos únicos, cleanup exato e verificado e nunca usar banco local, simulador ou fallback. Cobrir resolução da Loja, Cardápio, checkout, recálculo server-side, Pausa, Delivery, Pedido Guest/autenticado, estados, cancelamento, RLS e RBAC.
- A prova de RLS usa role de negócio não privilegiada e ao menos duas Lojas sintéticas. Mock de Prisma, banco em memória sem policies ou `service_role` padrão não provam isolamento.
- A prova de RBAC verifica respostas e ausência de efeito persistido para ações negadas ao Operador. Esconder navegação no Painel não é prova de autorização.
- JWTs podem usar chave/JWKS controlados em teste; Woovi e Asaas podem usar adapters fakes no limite HTTP/SDK; relógio e Sentry podem ser controlados.
- **Seam 2 — webhooks e reconciliação:** exercitar endpoints reais Woovi/Asaas e a entrada short-lived da reconciliação contra persistência real. Cobrir assinatura inválida, duplicata, reentrega, eventos fora de ordem, associação à Loja, Estorno, Ledger e convergência depois de evento perdido.
- Repetir webhook, cancelamento, Estorno ou reconciliação deve produzir um único efeito lógico e nunca regredir estado financeiro.
- O agendador Railway e a rede externa não fazem parte da suíte determinística; testa-se a entrada e sua repetição segura.
- **Seam 3 — Vitest determinístico:** manter suíte estreita para helpers de dinheiro, cálculo do Ledger e parsers/normalizadores Woovi e Asaas, usando fixtures sanitizadas compartilhadas com a Seam 2.
- Os helpers provam totais em centavos, aplicação de 1,19% no PIX, 3,29% mais R$ 0,79 no Crédito, ausência de lançamento para `on_delivery` e distinção entre previsão e pagamento efetivo.
- Parsers aceitam eventos válidos representativos, rejeitam payloads incompatíveis e preservam identidade/correlação para idempotência.
- Checkout e QA do piloto cobrem somente PIX, Crédito online e Pagamento na entrega, com happy path exclusivamente em `pilot_platform`.
- Browser E2E amplo, chamadas reais aos gateways, staging, WebSocket, SSE e BaaS não são requisitos do aceite do piloto.
- CI exige lint, typecheck, Vitest e validação das migrations. Mudanças de RLS exigem teste de isolamento, não apenas geração bem-sucedida do Prisma Client.

## Out of Scope

- API Meta, bot ou automação de WhatsApp; o MVP usa somente `wa.me` iniciado pelo Consumidor.
- Aplicativo nativo, praça multi-Loja, diretório de parceiros, ranking ou carrinho entre Lojas.
- Sincronização com iFood, Keeta ou outro marketplace.
- Domínio ou subdomínio personalizado por Loja.
- Workspace, multi-unidade, `workspace_id`, `merchant_id` como tenant ou schema por tenant.
- WebSocket, SSE ou Supabase Realtime para Pedidos.
- BaaS em produção no dia 1, split, onboarding de subconta no happy path do piloto ou mais de um Comerciante em `pilot_platform`.
- UI ou ativação comercial de `merchant_own_account`.
- Débito online, Voucher online, parcelamento, boleto ou PSP adicional no checkout.
- Redis, fila externa, worker sempre-on, staging, preview environments, Loja `is_demo`, Kubernetes ou multi-região.
- Catálogo Airbnb, Rausch, Airbnb Cereal, property cards, search orb ou containers com fill/sombra como padrão.
- KDS, NF-e, estoque completo, impressão térmica, PCI próprio ou integração de maquininha.
- Fidelidade por quantidade de Pedidos, item grátis, pontos, cashback ou gamificação.
- Taxa de Delivery por km/raio, geocoding ou atribuição de frota.
- Cobrança self-serve ou recorrente da Mensalidade, meter de GMV, bloqueio pelo teto ou overage automático.
- Estorno parcial, Estorno sem cancelar o Pedido ou botão independente de Estorno.
- Conclusão automática de Pedido, agendamento de Pedido ou status logísticos adicionais.
- Browser E2E amplo como bloqueador do piloto, Datadog ou implantação completa de OpenTelemetry.

## Further Notes

- As teses de produto e stack e os grillings de lacunas e BaaS estão fechados. A implementação não deve reabrir essas decisões.
- Números comerciais vigentes: R$ 179/mês; R$ 1.718,40/ano; PIX 1,19% D+1; Crédito à vista 3,29% + R$ 0,79 D+33. Menções históricas diferentes estão superseded.
- O teto de R$ 15 mil de GMV online é âncora comercial fora do produto.
- O piloto possui exatamente um Comerciante-modelo em `pilot_platform`; a fixture de duas Lojas usada em teste serve apenas para provar isolamento RLS.
- O contato com Asaas durante o piloto é informativo. Homologação formal só começa depois do piloto validado e da abertura da LTDA.
- Depois da homologação, o Comerciante-modelo migra para `baas` e novos Comerciantes nascem nesse modo. Até lá, não existe contingência comercial por `merchant_own_account`.
- O onboarding de subconta `baas` deve ser tratado como ticket futuro e bloqueado, fora do aceite do piloto.
- O histórico do Ledger do piloto permanece auditável depois de futura migração para `baas`.
- Decisões de implementação menores podem ser fechadas dentro dos tickets desde que preservem as invariantes desta spec e não introduzam itens fora do MVP.
