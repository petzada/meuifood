# Pesquisa: stack de pagamentos, infra, integrações e ops

**Data:** jul/2026 · **Tipo:** pesquisa técnica (padrões / ops / infra) · **Não é decisão**

**Contexto de produto já fechado (não reabrir):** PIX Woovi + cartão Asaas; piloto = MEI + `pilot_platform`; escala = BaaS na LTDA / subcontas — ver decisões [46](../decisoes/46-grilling-homologacao-baas-mei-ltda.md)–[54](../decisoes/54-implicacoes-minimas-modo-baas.md) (o “fallback conta por lojista” abaixo é **histórico de pesquisa**, revogado como política em [52](../decisoes/52-espera-sem-limite-ate-baas.md)). WhatsApp MVP = só `wa.me`; web mobile-first em `foodedelivery.com.br/loja/[slug]`.

Detalhes de taxas/MDR: ver `04`–`08`. Este doc foca em **como integrar, hospedar e operar**.

---

## 1. Padrões de integração (SaaS similares)

Três modelos dominam cardápio digital / canal próprio no BR:

| Modelo | Como funciona | Quem faz KYC | Take rate da plataforma | Fit Foode |
| --- | --- | --- | --- | --- |
| **A. Conta por lojista** | Lojista cria conta no gateway (MP/Cielo/Asaas) e cola credenciais no painel | Lojista | Cobrança **à parte** (mensalidade / % GMV faturado) — dinheiro **não** passa pela plataforma | Fallback pós-piloto; padrão Cardápio Web, MenuDino/Consumer, Simpliza |
| **B. Split / subconta** | Plataforma cria cobrança e divide (ou subconta virtual) | Plataforma + KYC leve do lojista | Embutido no split / markup | Woovi split (PIX); Asaas split após BaaS |
| **C. BaaS / white-label** | Subcontas sob CNPJ da plataforma; marca do provedor obrigatória (Bacen Res. 16/17) | Plataforma orquestra onboarding | Split nativo + controle operacional | Alvo Asaas para escala multi-loja |

**Sinais de mercado (público):**
- **Cardápio Web:** MP/Cielo = **credenciais do lojista**; PIX “automático” via Tuna (repasse ~D+1, taxa fixa citada R$ 0,50) — híbrido A + provedor intermediário.
- **MenuDino/Consumer, Simpliza:** lojista traz Cielo/PagSeguro/MP — modelo A puro.
- **Desio / marketplaces:** take-rate all-in — **não** é o padrão “0% comissão” do segmento SaaS.

**Implicação Foode (piloto → escala):**
1. **Piloto:** tudo no **MEI do founder** (Asaas cartão + Woovi PIX) → repasse manual/contratual ao lojista (D+32 cartão alinhado ao settlement Asaas).
2. **Próximos clientes:** preferir **BaaS Asaas**; se atrasar → **conta Asaas por lojista** + markup cobrado na fatura SaaS (não depender de split).
3. **PIX:** manter Woovi (já na tese); split/subconta Woovi só quando multi-loja exigir segregação sem passar saldo pelo MEI.

⚠️ **Incerteza:** prazo comercial real de liberação BaaS Asaas para MEI vs exigência de LTDA — confirmar com gerente de contas (não está no FAQ público).

---

## 2. Infra (hospedagem comum)

| Camada | Opções frequentes (sinal 2025–26) | Notas MVP |
| --- | --- | --- |
| **App web (Next.js / SSR)** | **Vercel** (padrão open-source cardápio BR: Zairyx, ChefOps); Railway / Fly / Coolify+VPS | Path `/loja/[slug]` encaixa em um app; edge CDN ajuda mobile |
| **DB** | **Supabase / Neon / Postgres gerenciado** | Multi-tenant por `slug` + `tenant_id` |
| **Filas / jobs** | Vercel Cron + tabela; ou worker em Railway/Render; SQS/Rabbit só em volume | Webhooks: persistir → processar async |
| **Storage (fotos cardápio)** | Cloudflare R2 / S3 / Supabase Storage | Obrigatório desde o MVP (imagens) |
| **Realtime painel pedidos** | Polling curto ou Supabase Realtime / SSE | WebSocket dedicado = complexidade extra — adiar |
| **Domínio** | Vercel + DNS do `.com.br` | Já decidido: path, não subdomínio por loja |

**Regra prática founder:** 1 app na Vercel + Postgres gerenciado + storage barato cobre o MVP. Separar worker só se timeout de webhook/serverless virar problema.

⚠️ **Incerteza:** stack exata do Foode ainda não fechada — padrões acima são **benchmark**, não prescrição.

---

## 3. Webhooks, idempotência e conciliação

### 3.1 Contratos dos provedores

| | **Woovi (PIX)** | **Asaas (cartão)** |
| --- | --- | --- |
| Evento-chave | `OPENPIX:CHARGE_COMPLETED` (+ expired/created) | `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` (e created/updated) |
| Entrega | Quase tempo real (docs: ~1,5s em 99% no ecossistema OpenPix) | **At-least-once**; retry progressivo; fila pode pausar após **15** falhas; eventos ~**14 dias** |
| Auth | Preferir `x-webhook-signature` (chave pública Woovi); HMAC `X-OpenPix-Signature` = legado | `authToken` no header + allowlist de IPs oficiais |
| Docs | [Eventos](https://developers.woovi.com/docs/webhook/webhook-events-type) · [Assinatura](https://developers.woovi.com/docs/webhook/seguranca/webhook-signature-validation) | [Idempotência](https://docs.asaas.com/docs/how-to-implement-idempotence-in-webhooks) · [Receber eventos](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint) |

### 3.2 Padrão operacional (obrigatório no MVP)

1. **Endpoint magro:** validar assinatura/token → gravar evento com **ID único** → **HTTP 200** rápido.
2. **Idempotência:** unique constraint em `provider_event_id` (Asaas: campo `id` do payload; Woovi: `charge.correlationID` / id da cobrança + tipo de evento).
3. **Worker:** só o worker muda status do pedido (`pago` / `expirado` / `falhou`).
4. **Não confiar só no webhook:** job de **reconciliação** (ex.: a cada 5–15 min) consulta API por cobranças `pending` > N minutos.
5. **Conciliação diária:** planilha/relatório `pedido_id ↔ charge_id ↔ valor ↔ status gateway ↔ status interno`; divergências = fila manual no piloto.
6. **Repasse piloto (MEI):** ledger interno (valor líquido, data prevista D+32, data pago ao lojista) — sem isso o D+32 vira caos contábil.

### 3.3 Estados mínimos do pagamento

`criado` → `aguardando` → `pago` | `expirado` | `estornado` (estornos = pós-MVP manual no painel do gateway).

---

## 4. LGPD / dados mínimos de pedido

Base legal típica do checkout: **execução de contrato** (Art. 7º, V, Lei 13.709/2018) — não misturar com marketing no mesmo checkbox.

| Dado | MVP? | Motivo |
| --- | --- | --- |
| Nome + telefone (WhatsApp) | **Sim** | Contato / `wa.me` |
| Endereço (delivery) ou flag retirada | **Sim** | Cumprir pedido |
| Itens, observações, total | **Sim** | Pedido |
| E-mail | Opcional | Comprovante; não obrigar |
| CPF | Só se NF / antifraude exigir | Minimização |
| PAN/CVV cartão | **Nunca no Foode** | Só no Asaas (PCI no provedor) |
| Geolocalização contínua / biometria | **Não** | Fora do MVP |

**Ops LGPD enxuta:**
- Política de privacidade + papel Foode vs lojista (quem é controlador do dado do consumidor final — em geral **lojista** + Foode como operador/plataforma; **confirmar juridicamente**).
- HTTPS, acesso ao painel autenticado, sem logar payload completo de cartão.
- Canal simples para titular (e-mail) pedir acesso/exclusão.
- Retenção: pedido operacional curto; dados fiscais seguem prazo legal (~5 anos) se houver NF.

Fontes: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) · [checklist checkout MP](https://www.mercadopago.com.br/blog/lgpd-checkout-checklist-coleta-de-dados).

---

## 5. Custo / complexidade: founder MEI → BaaS Asaas

| Fase | O que acontece | Custo / atrito |
| --- | --- | --- |
| **0 – Piloto** | 1 conta Asaas MEI + 1 Woovi; money-in no founder; repasse D+32 ao lojista | Baixo eng.; **alto risco operacional/compliance** se misturar muitos lojistas |
| **1 – Avaliação regulatória** | 1ª subconta via API → teto **10** subcontas · **R$ 2.000**/subconta · **60 dias** | Insuficiente para delivery real (estoura em dias) |
| **2 – Homologação BaaS** | Gerente de contas + playbook Bacen 16/17; evidenciar marca Asaas no onboarding/comprovantes; docs sócios (selfie + RG/CNH); MEI ok em `companyType` | Semanas–meses; **trabalho de produto/compliance**, não só código |
| **3 – Pós-BaaS** | `apiKey` de subconta permanente; split; webhooks já na criação da subconta | Escala multi-loja |

Docs: [BaaS subcontas](https://docs.asaas.com/docs/cria%C3%A7%C3%A3o-de-subcontas-baas) · [FAQ avaliação](https://docs.asaas.com/docs/faq-periodo-de-avaliacao) · [Onboarding docs](https://docs.asaas.com/docs/onboarding-e-envio-de-documentos-via-link) · [Criação subcontas](https://docs.asaas.com/docs/criacao-de-subcontas).

**Fallback se BaaS atrasar:** cada lojista com **própria conta Asaas** (modelo A) — Foode só orquestra cobrança com a API key do lojista; take rate via fatura SaaS.

⚠️ **Incertezas:** (1) MEI sozinho ser aceito como Tomadora BaaS em produção multi-CNPJ; (2) necessidade de migrar founder para **LTDA** antes da homologação; (3) custo comercial Asaas do BaaS (não público).

---

## 6. O que NÃO fazer no MVP

- **API oficial Meta / WhatsApp Business** — só deep link `wa.me`.
- **Subcontas Asaas em produção “para testar escala”** sem alinhamento BaaS — cai no teto R$ 2k/60d e trava.
- **Receber dinheiro de vários lojistas na mesma conta MEI** sem contrato/ledger claros (além do 1º piloto).
- **Armazenar dados de cartão** ou montar checkout PCI próprio.
- **Marketplace / split complexo / antecipação automática** como feature de produto.
- **App nativo, WebSocket de KDS, NF-e, bot IA, multi-gateway (MP+Cielo+…)** no caminho crítico.
- **Polling agressivo** no lugar de webhook + reconciliação pontual.
- **Prometer settlement cartão &lt; D+32** (Asaas padrão é D+32).
- **PIX no Asaas** (mais caro que Woovi — tese já fechada).
- **Infra multi-região / Kubernetes** — overkill; Vercel + Postgres basta.

---

## Fontes (principais)

| Tema | URL |
| --- | --- |
| Asaas webhooks / idempotência | https://docs.asaas.com/docs/how-to-implement-idempotence-in-webhooks |
| Asaas BaaS | https://docs.asaas.com/docs/cria%C3%A7%C3%A3o-de-subcontas-baas |
| Asaas período avaliação | https://docs.asaas.com/docs/faq-periodo-de-avaliacao |
| Asaas split | https://docs.asaas.com/docs/split-de-pagamentos |
| Woovi webhooks | https://developers.woovi.com/docs/webhook/webhook-events-type |
| Woovi assinatura webhook | https://developers.woovi.com/docs/webhook/seguranca/webhook-signature-validation |
| Woovi split | https://developers.woovi.com/docs/splits/split-introduction |
| Cardápio Web pagamentos | https://ajuda.cardapioweb.com/gestao/minha-empresa/formas-de-pagamentos |
| LGPD | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm |
| Interno (taxas) | `docs/pesquisa/04`–`08` |

---

## Achados-chave (1 linha)

Piloto MEI + repasse D+32 é válido só com **1 loja e ledger**; escala exige **BaaS ou conta-por-lojista**; webhooks **idempotentes + reconciliação**; infra **Vercel-class + Postgres**; MVP **sem** Meta API, sem PCI próprio, sem subcontas Asaas “escondidas”.
