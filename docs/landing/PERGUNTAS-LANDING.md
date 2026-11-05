# Perguntas em aberto — landing e páginas públicas

**Data:** 2026-11-05 · Responder marca as escolhas na [PROPOSTA-LANDING](PROPOSTA-LANDING.md) e na [PROPOSTA-SEO](PROPOSTA-SEO.md). **(rec.)** = recomendada. Motion e visual já foram decididos pelo Dono e não aparecem aqui.

## CTA e captação

**Q-cta-1. Qual é o CTA primário da página?**
- a) **(rec.)** Formulário curto (nome, WhatsApp, Loja, cidade, pedidos/dia) com "ou chame no WhatsApp" como link secundário.
- b) Botão WhatsApp (`wa.me` com texto pré-preenchido) em todos os CTAs; sem formulário.
- c) Formulário longo de qualificação (7 campos, estilo Anota).
- d) Só e-mail (`mailto:`), como hoje.
- Avaliação: (a) captura rastreável e qualifica sem fricção; (b) converte melhor no celular, mas perde origem e expõe um número; (c) afasta o pequeno; (d) perde o lead.

**Q-cta-2. Onde o lead do formulário chega?**
- a) **(rec.)** Gravado em D1 (tabela `leads`, lida no `/ops`) + e-mail pela MillionSend para a Foode.
- b) Só e-mail pela MillionSend.
- c) Mensagem no WhatsApp da Foode via whatsmiau.dev.
- Avaliação: (a) dá fila de leads auditável no Ops, que já existe; (b) é o mínimo e se perde; (c) acopla a venda à API de login do Consumidor.

**Q-cta-3. Botão flutuante de WhatsApp no canto da landing?**
- a) **(rec.)** Não; CTA repetido por seção basta e evita cobrir conteúdo no mobile.
- b) Sim, só no desktop.
- c) Sim, em todas as telas.
- Avaliação: cobre CTAs e rodapé no celular; a decisão 64 já tirou `wa.me` do suporte, manter a venda num só canal declarado.

**Q-cta-4. Qual o compromisso de resposta prometido sob o CTA?**
- a) **(rec.)** "Resposta no mesmo dia útil."
- b) "Resposta em até 2 horas em horário comercial."
- c) Nenhuma promessa.
- Avaliação: prometer só o que um dev solo cumpre; (b) vira quebra de confiança no primeiro atraso.

**Q-cta-5. Número de WhatsApp da venda é o mesmo número oficial da Foode (whatsmiau)?**
- a) **(rec.)** Número comercial separado (chip/linha da Foode), para não misturar com o envio de códigos.
- b) Mesmo número oficial.
- Avaliação: o número de códigos não deve receber conversa humana, por risco de bloqueio e ruído.

## Planos e preço na página

**Q-planos-1. Como mostrar as faixas?**
- a) **(rec.)** Dois cards (Mensal com 3 faixas + Anual 12× R$ 84,99), Mensal primeiro, selo "Você começa aqui" na faixa até 150.
- b) Um card por faixa (3 cards) + Anual.
- c) Só "a partir de R$ 84,99" e detalhes em `/precos`.
- Avaliação: (a) é o formato que o ICP já conhece do concorrente e cabe no mobile; (b) parece três planos com features diferentes (viola a decisão 11/61); (c) esconde preço, o que o Goomer faz e custa leads.

**Q-planos-2. Mostrar as taxas de pagamento online (PIX/cartão) com números?**
- a) **(rec.)** Mostrar a tabela padrão do `/ops` como "taxas de referência" com nota "confirmadas no cadastro da Loja" — só depois de o Ops cadastrar a tabela padrão (hoje nasce vazia).
- b) Só a frase "+ taxas de pagamento online, combinadas no cadastro".
- c) Não mencionar taxas na landing.
- Avaliação: o ICP compara MDR (decisão 02); sem número ele assume o pior. Diverge da decisão 61 só se os valores forem inventados em código — por isso a origem tem de ser o `/ops`.

**Q-planos-3. Mostrar o Anual com "equivale a R$ 84,99/mês" ou com o total R$ 1.019,88?**
- a) **(rec.)** Ambos: `12× R$ 84,99` em destaque e `R$ 1.019,88/ano` em linha menor.
- b) Só 12× R$ 84,99.
- c) Só o total anual.
- Avaliação: a parcela ancora, o total evita sensação de pegadinha. Sem "de/por" riscado.

**Q-planos-4. Dizer explicitamente "sem teste grátis"?**
- a) **(rec.)** Sim, no FAQ e sob o card, reformulado como "Sem teste grátis: a Foode cadastra sua Loja e acompanha a ativação".
- b) Não falar.
- Avaliação: o visitante vindo do Anota procura o trial; omitir gera pergunta e abandono; dizer com a contrapartida vira benefício.

**Q-planos-5. Comparativo de preço com concorrentes na página?**
- a) **(rec.)** Coluna "Outros SaaS de cardápio" com faixa pública ("a partir de R$ 99,99") sem citar marca.
- b) Citar Anota, Goomer etc. nominalmente com preços.
- c) Sem comparativo de SaaS; só vs. marketplace.
- Avaliação: (a) ancora os 15% abaixo (decisão 61) sem risco jurídico/manutenção; (b) desatualiza e pode gerar notificação; (c) perde o argumento de troca de SaaS (decisão 03).

## Prova social

**Q-prova-1. O que mostrar enquanto não há Lojas ativas?**
- a) **(rec.)** Omitir a faixa de números e usar a Loja-modelo real ("veja um cardápio ao vivo") como prova.
- b) Números de mercado com fonte ("PMEs pagam até 27% de comissão").
- c) Depoimento do próprio Dono/founder.
- Avaliação: nunca inventar contagem; a Loja-modelo é a prova mais forte que um produto novo tem.

**Q-prova-2. Link para o Storefront de uma Loja real na landing?**
- a) **(rec.)** Sim, para a Loja-modelo com consentimento, com rótulo "Loja parceira".
- b) Sim, uma Loja de demonstração fictícia da Foode.
- c) Não.
- Avaliação: (a) prova real; (b) exige Loja fictícia que a decisão 62 tratou como não-fixture; (c) perde a demo mais barata.

**Q-prova-3. Depoimentos: formato quando existirem?**
- a) **(rec.)** 1–3 cards com foto/logo, nome, cidade, frase e um número do Painel (pedidos no Canal próprio/mês).
- b) Vídeo curto.
- c) Nota em estrelas.
- Avaliação: número do Painel é verificável; estrelas sem volume parecem fabricadas.

**Q-prova-4. Mostrar o CNPJ e a cidade da Foode no rodapé?**
- a) **(rec.)** Sim, assim que houver LTDA/MEI formal a declarar.
- b) Não por enquanto.
- Avaliação: transparência básica B2B; o lojista confere antes de pagar fora do app.

## Conteúdo e SEO

**Q-conteudo-1. Blog no MVP?**
- a) **(rec.)** Não; só páginas de segmento e `/como-funciona`. Reavaliar com 10 Lojas.
- b) Sim, 1 post/mês.
- Avaliação: a decisão 05 descarta SEO nacional como motor; blog sem cadência prejudica mais do que ajuda.

**Q-conteudo-2. Qual número de comissão usar na seção "dor"?**
- a) **(rec.)** Faixa "12% a 27%" com nota "comissão e taxas típicas de marketplaces de delivery no Brasil", simulação com ticket R$ 60.
- b) Um número fixo (ex.: 23%).
- c) Não citar número.
- Avaliação: a faixa é defensável e não cita marca; número único exige fonte e envelhece.

**Q-conteudo-3. Tom da comparação com marketplace?**
- a) **(rec.)** Complementar: "o marketplace traz o cliente novo; o recorrente pede no seu link".
- b) Substituição: "saia do iFood".
- Avaliação: (a) é a decisão 03; (b) diverge da decisão 03 e assusta quem depende do marketplace.

**Q-conteudo-4. Seção de garantias (uptime, LGPD, suporte)?**
- a) **(rec.)** Três itens só com o que é cumprido: "na Cloudflare", "LGPD: dados do cliente são da sua Loja", "suporte humano em horário comercial".
- b) Prometer 99,9% de disponibilidade.
- c) Sem seção.
- Avaliação: SLA sem contrato é risco; os três itens são verdadeiros hoje.

**Q-conteudo-5. Analytics da landing?**
- a) **(rec.)** Cloudflare Web Analytics (sem cookie, sem banner) + eventos de CTA.
- b) Google Analytics 4 com banner de consentimento.
- c) Nenhum.
- Avaliação: (a) mede CWV e conversão sem popup de cookies (anti-padrão listado); (b) exige banner e LGPD; (c) impede otimizar.

## Visual e hero (fora motion, já decidido)

**Q-hero-1. Manchete do hero?**
- a) **(rec.)** "Seu delivery, no seu link. Sem comissão por pedido."
- b) "Venda delivery direto pelo seu link, sem pagar comissão."
- c) "O canal próprio do seu delivery, a partir de R$ 84,99 por mês."
- Avaliação: (a) curta, tem a palavra-chave "delivery" e a promessa; (c) copia a âncora de preço do Anota e envelhece quando o preço mudar.

**Q-hero-2. O que aparece no mockup do hero?**
- a) **(rec.)** Storefront real (celular) na frente + fila do Painel atrás.
- b) Só Storefront.
- c) Só Painel.
- Avaliação: o lojista compra o Painel mas vende pelo Storefront; os dois juntos contam a história em uma imagem.

**Q-hero-3. Foto de comida no hero?**
- a) **(rec.)** Só como fundo desfocado ≤ 15% de opacidade atrás dos mockups.
- b) Foto grande como hoje.
- c) Nenhuma foto.
- Avaliação: (b) foi o problema atual (não mostra produto); (c) deixa o hero frio para o segmento alimentar.

**Q-hero-4. Termos do glossário em maiúscula na copy pública ("Loja", "Pedido", "Canal próprio")?**
- a) **(rec.)** Não; na landing usar português corrente ("sua loja", "pedidos"). O glossário vale para código e docs.
- b) Sim, manter.
- Avaliação: maiúscula no meio da frase lê como erro para o lojista.

## Páginas públicas

**Q-paginas-1. Storefront `/loja/[slug]` indexável?**
- a) **(rec.)** Indexar Lojas `active` com descrição e logo; `noindex` nas demais; opt-out por Loja (campo no Ticket 28).
- b) Indexar todas as `active`.
- c) `noindex` em todo o Storefront.
- Avaliação: busca por "nome da loja cardápio" é o SEO que o lojista sente; páginas sem conteúdo prejudicam o domínio, daí o filtro.

**Q-paginas-2. Páginas de segmento `/para/[segmento]`?**
- a) **(rec.)** 6 páginas iniciais com copy e tela diferentes (hamburgueria, pizzaria, marmitaria, açaí, japonês, padaria).
- b) Só chips na home, sem páginas.
- c) 12+ páginas geradas por template.
- Avaliação: (a) material de venda e cauda longa com conteúdo real; (c) vira conteúdo fino duplicado.

**Q-paginas-3. Termos de uso: um documento ou dois?**
- a) **(rec.)** Dois: `/termos` (lojista, inclui mensalidade, repasse, taxas, cancelamento) e `/privacidade` reescrita cobrindo site, Storefront, Painel e leads; termos do Consumidor como seção da privacidade.
- b) Um documento único.
- Avaliação: o contrato com o lojista (cobrança fora do app, custódia, repasse D+1) precisa de texto próprio; revisão jurídica antes de publicar.

**Q-paginas-4. Páginas de cidade `/cidades/[cidade]`?**
- a) **(rec.)** Não agora; criar quando uma cidade tiver ≥ 3 Lojas ativas, em ordem alfabética, sem ranking.
- b) Criar já para a cidade-piloto.
- c) Nunca (respeitar literalmente a decisão 14).
- Avaliação: (a) respeita "diretório é pós-MVP" (14) e evita página vazia; (c) desperdiça a busca local mais valiosa quando houver volume.

**Q-paginas-5. Página `/sobre`?**
- a) **(rec.)** Sim, curta (quem, cidade, por quê, CNPJ), sustenta `Organization` e confiança.
- b) Não.
- Avaliação: B2B local compra de gente; uma página de 3 parágrafos resolve.
