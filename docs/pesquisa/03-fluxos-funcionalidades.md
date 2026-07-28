# Pesquisa: fluxos, personas e funcionalidades

**Data:** jul/2026 · **Tipo:** mapa de produto de mercado (não é decisão)

## Personas

### 1) Dono do estabelecimento (cliente pagante da plataforma SaaS)

- Precisa: receber pedidos sem perder margem; organizar cardápio/entregas; pagar o mínimo possível.
- Dor: taxas de marketplace; pedidos bagunçados no WhatsApp; falta de base própria de clientes.
- Sucesso: mais pedidos no canal próprio + operação controlada + custo previsível.

### 2) Consumidor final (usuário do cardápio / app da loja)

- Precisa: pedir fácil (link/WhatsApp), pagar, acompanhar entrega/retirada.
- Dor: baixar vários apps; cardápio desatualizado; fricção de pagamento.
- Sucesso: pedido rápido do restaurante favorito sem “taxa de plataforma” embutida no preço.

### 3) Entregador (secundário no MVP SaaS)

- Só entra cedo se a plataforma oferecer app de entrega / despacho; senão é operação da loja (motoboy próprio ou terceirizado).

## Dois mundos de produto

| Mundo | O que vende | Como ganha | Exemplo |
| --- | --- | --- | --- |
| **A — Marketplace** | Demanda (consumidores) | Comissão % + pagamento + mensalidade | iFood, Keeta |
| **B — Canal próprio / cardápio digital** | Software + pedidos da base da loja | SaaS / freemium | Anota, Goomer, InstaDelivery, MenuDino |

A tese descrita pelo founder encaixa em **B**, com opcional futura camada de marketplace local (híbrido) — decisão load-bearing.

## Fluxos principais (mundo B)

1. **Onboarding loja** → cadastro, horários, área de entrega, formas de pagamento.
2. **Montagem de cardápio** → categorias, itens, opcionais, fotos, disponibilidade.
3. **Divulgação** → link, QR, Instagram/WhatsApp, (futuro) vitrine multi-loja.
4. **Pedido do consumidor** → navega cardápio → carrinho → checkout (entrega/retirada).
5. **Pagamento** → na entrega / PIX / cartão online (gateway).
6. **Operação** → painel aceita/prepara/despacha; status ao cliente.
7. **Entrega** → motoboy da loja ou parceiro; rastreio opcional.
8. **Pós-venda** → cupom, fidelidade, recompra via WhatsApp.

## MVP típico do mercado vs avançado

| MVP (quase todos têm) | Avançado |
| --- | --- |
| Cardápio + link/PWA de pedido | Bot WhatsApp / Instagram |
| Painel de pedidos (aceitar → despachar) | PDV + KDS + estoque + NF-e |
| Taxa entrega por bairro/km | App entregador + frota parceira |
| Pagamento na entrega + **PIX no checkout** | Gateway cartão + split |
| Cupom simples | Fidelidade / cashback / CRM |
| 1 loja · entrega própria simples | Multi-loja · app do consumidor · consolidar pedidos iFood no mesmo painel |

Nota de mercado: **PIX cedo** reduz no-show e virou table stakes; frota/KDS/NF/app do consumidor ficam para depois de volume.

## Decisões de produto load-bearing (para grilling)

1. **Só canal próprio (SaaS) vs marketplace local vs híbrido** — define taxas, CAC e roadmap.
2. **Quem paga:** só lojista (B2B) vs também take-rate no pedido.
3. **Aquisição do consumidor:** responsabilidade 100% da loja vs plataforma ajuda a trazer demanda.
4. **WhatsApp-first vs web app vs ambos.**
5. **Pagamento:** só externo/na entrega vs integrado (implica compliance + custo gateway).
6. **Logística:** fora do escopo vs despacho básico vs frota.
7. **Escopo geográfico:** uma cidade primeiro vs nacional genérico.
8. **Posição vs iFood:** substituto agressivo vs complementar (“reduza dependência”).

## Hipótese de posicionamento (ainda não decidida)

> Software web de gestão + cardápio digital para PMEs de delivery, com preço abaixo do mid-market (Anota) e onboarding local, sem comissão sobre pedido — começando por uma cidade, vendendo margem e simplicidade, não demanda de marketplace.
