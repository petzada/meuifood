# 70 — Nova landing, páginas públicas e SEO

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Base:** [docs/landing/](../landing/) (análise, proposta, SEO, perguntas) · **Complementa:** [40](40-marketing-no-apps-web.md), [61](61-monetizacao-faixas-taxas-anota.md), [14](14-descoberta-link-e-diretorio-parceiros.md)

A direção de **motion e visual** da [PROPOSTA-LANDING §4](../landing/PROPOSTA-LANDING.md) está decidida (animações de imagens e ícones, parallax em camadas, layouts bento/assimétricos/sticky, mockups reais, `prefers-reduced-motion`, sem CLS, só transform/opacity, identidade Foode).

## Hero

- **H1:** "Organize seu delivery, sem comissão por pedido". **Sub-headline:** "Cardápio digital, pedidos e pagamento online facilitado para o seu negócio".
- Headline, sub e CTA **centralizados sobre foto de comida com fundo desfocado**; os **mockups (Storefront no celular + fila do Painel)** vêm logo abaixo, num parallax que cobre o hero ao rolar.
- Abaixo do CTA: uma linha de texto simples, sem destaque, com ícone de cadeado: **reembolso integral em até 7 dias**.
- Copy pública em português corrente ("sua loja", "pedidos"), sem as maiúsculas do glossário.

## CTA e captação

- CTA principal: **formulário curto** (nome, WhatsApp, loja, cidade, pedidos/dia), gravado em D1 (tabela de leads) e **lido no `/ops`**, com aviso por e-mail para a Foode; "ou chame no WhatsApp" como link secundário.
- **WhatsApp de vendas é um número comercial separado** do número de códigos; o número **não é público**: botões apontam para **`/falar`**, que redireciona no servidor para o `wa.me` (número em secret `SALES_WHATSAPP`, nunca no HTML nem no repositório).
- Botão flutuante de WhatsApp **só no desktop**. Sem promessa de tempo de resposta.

## Planos e preço

- **Dois cards do mesmo tamanho** (Mensal com as 3 faixas, selo "Você começa aqui" na faixa até 150 Pedidos; Anual com **borda em destaque e badge com a % real de desconto**), benefícios, valores, tamanhos e botões **alinhados verticalmente**; benefícios exclusivos do Anual em **negrito**.
- Anual: **12× R$ 84,99** em destaque e **R$ 1.019,88/ano** em linha menor; sem "de/por".
- Abaixo do botão de cada plano: linha com cadeado — **reembolso integral em até 7 dias** (substitui o "sem teste grátis"). Nova política comercial: entra nos `/termos`.
- **Taxas online:** mostrar a % do **PIX** e do **Cartão de crédito** lidas da tabela padrão do `/ops` ("confirmadas no cadastro da Loja"; só aparecem depois de cadastradas), e um card explicando o **modo Rápido** (taxa diferente, recebimento D+1).
- **Comparativo com concorrentes:** tabela com **dados reais** da Goomer e da Anota.ai, colunas "Outra plataforma" sem citar nome, títulos ilustrados com as **cores** de cada concorrente e conteúdo "apagado"; a coluna Foode tem **uma borda unificada de ponta a ponta** e destaca onde ganhamos (benefício, tarifa, prazo, mensalidade) — só vantagens reais e comparáveis, com fonte e data registradas no repositório.

## Prova social e institucional

- **Seção do fundador** (no lugar de números/depoimentos): card da largura da página com fundo sólido, **dois parágrafos** — (1) quem é o Marcio e como fundou a Foode; (2) as principais dores/objeções dos donos de estabelecimento (pesquisadas em fontes públicas como Reclame Aqui sobre concorrentes) e como a Foode as resolve com funcionalidades reais.
- **Loja de demonstração fictícia da Foode** linkada na landing ("veja um cardápio ao vivo"): Loja criada pelo Ops, marcada como demonstração (não recebe Pedido real, não conta em métricas/faixa, `noindex`).
- Depoimentos de Lojas e prova social numérica: **pós-MVP**.
- Rodapé: **CNPJ 63.940.273/0001-36**, razão social **MARCT SOLUÇÕES DIGITAIS**, e o texto "A plataforma Foode Delivery é operada integralmente pela empresa Marct Soluções Digitais, situada em São Paulo."
- **Sem** seção de garantias. **Sem** página `/sobre`.

## Dor vs. marketplace

- Sem citar % de comissão: só "sem comissão por pedido", em **tom complementar** ao marketplace ([03](03-posicionamento-complementar-e-troca-saas.md)).
- **Calculadora** intuitiva: o lojista informa pedidos/mês, ticket médio e a comissão que paga hoje e vê quanto deixaria de pagar com a Foode (mensalidade da faixa correspondente).

## Conteúdo, SEO e páginas públicas

- **Blog desde o lançamento, 1 post/mês**: comparativos e soluções orientados a captação, com SEO, **GEO/AEO** (respostas diretas, FAQ estruturado), **`llms.txt`** e leitura por bots de IA generativa. O lançamento inclui a infraestrutura do blog e os primeiros posts.
- **Storefront indexável** só para Lojas ativas com descrição e logo; `noindex` nas demais; opt-out por Loja.
- **6 páginas de segmento** com conteúdo próprio (hamburgueria, pizzaria, marmitaria, açaí, japonês, padaria).
- **Termos e Privacidade em dois documentos** (`/termos` do lojista com mensalidade, repasse, taxas e reembolso de 7 dias; `/privacidade` cobrindo site, Storefront, Painel e leads), com revisão jurídica antes de publicar.
- **Nunca** páginas por cidade. **Sem analytics** na landing.
- SEO técnico da [PROPOSTA-SEO](../landing/PROPOSTA-SEO.md): metadados, Open Graph (inclusive preview do Storefront), `robots`, `sitemap`, JSON-LD, canônicas, Core Web Vitals.

## Execução

Vira o **Ticket 31** (landing, páginas públicas, blog, leads), antes do Ticket 30.
