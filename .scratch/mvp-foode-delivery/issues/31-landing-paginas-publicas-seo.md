# 31 — Nova landing, páginas públicas, blog, leads e SEO

**What to build:** A home de `foodedelivery.com.br` reconstruída conforme a [decisão 70](../../../docs/decisoes/70-landing-paginas-publicas-seo.md) e a proposta em [docs/landing/](../../../docs/landing/), com captação de leads lida no `/ops`, blog, páginas de segmento, termos e privacidade e SEO técnico completo.

**Blocked by:** 28 (vitrine/indexação do Storefront), 29 (`/ops`). Roda em paralelo a 26/27.

**Status:** ready-for-agent

**Agente:** Fable (UI) para landing/páginas/blog; Opus (API) para leads, `/falar` e SEO técnico do lado da api.

- [ ] Hero da decisão 70 (H1/sub/CTA centralizados sobre foto de comida desfocada; mockups reais Storefront + fila em parallax abaixo; linha com cadeado "reembolso integral em até 7 dias").
- [ ] Motion e visual da PROPOSTA-LANDING §4 com `prefers-reduced-motion`, sem CLS, só transform/opacity, Core Web Vitals verdes no mobile.
- [ ] Seções: dor vs. marketplace (tom complementar, sem %), calculadora (pedidos/mês, ticket médio, comissão atual → economia), como funciona (sticky/scrollytelling), funcionalidades com telas reais, planos (2 cards iguais e alinhados, Anual com borda e badge da % real, linha de reembolso), taxas PIX/Cartão lidas do `/ops` + card do modo Rápido, comparativo com 2 concorrentes reais anônimos (cores, colunas apagadas, borda unificada da Foode; fonte e data registradas), seção do fundador (dois parágrafos, card de fundo sólido), FAQ, CTA final, rodapé com CNPJ/razão social/texto institucional.
- [ ] Leads: formulário curto → tabela de leads no D1 (migration expand) com Turnstile e rate limit → lista no `/ops` → e-mail para a Foode pela MillionSend.
- [ ] `/falar`: redireciona no servidor para o `wa.me` do secret `SALES_WHATSAPP` (nunca no HTML/repo); flutuante só no desktop.
- [ ] Loja de demonstração: flag de Loja demo no Ops (não recebe Pedido real, fora de métricas/faixa, `noindex`) e link "veja um cardápio ao vivo".
- [ ] Blog: infraestrutura (posts versionados no repo, listagem, post, RSS, JSON-LD Article) e os primeiros posts (comparativo e solução), otimizados para SEO/GEO/AEO; `llms.txt`.
- [ ] 6 páginas `/para/[segmento]` com conteúdo próprio; `/termos` e `/privacidade` reescritos (marcados para revisão jurídica).
- [ ] SEO técnico: `metadataBase`, OG (inclusive Storefront), `robots`, `sitemap`, JSON-LD Organization/SoftwareApplication/FAQPage, canônicas; Storefront indexável só para Loja ativa com descrição e logo (+ opt-out).
- [ ] Sem analytics na landing; sem páginas de cidade; sem `/sobre`; sem seção de garantias; depoimentos pós-MVP.
- [ ] Testes de componente (calculadora, planos, formulário de lead) e verificação de acessibilidade; preços lidos de `@foode/shared`.
- [ ] Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md): card do Anual: destaque "6× de R$ 188,20" (2,99% a.m., Tabela Price) e total R$ 1.019,88 abaixo sem destaque; tarifa de serviço do Consumidor só nos termos, nunca na landing/planos.

## Comments

- 2026-11-05 — Aberto a partir da análise `docs/landing/` e da decisão 70. Número de WhatsApp de vendas fica só em secret (`SALES_WHATSAPP`), configurado pelo orquestrador.

- 2026-11-05 — Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md) aplicada.

- 2026-11-05 — Fatia de API (`feat/31-leads-seed-391f`): tabela `leads` (migration 0008, expand), `POST /storefront/leads` (Turnstile + rate limit por IP + aviso pela MillionSend para `LEADS_NOTIFY_EMAIL`), `/ops/leads` no Painel, `/falar` (302 no servidor a partir do secret `SALES_WHATSAPP` do Worker do web) e `GET /storefront/taxas` (tabela padrão vigente) ligada às taxas da landing. Pendentes do ticket: Loja demo e itens de UI/SEO restantes.
