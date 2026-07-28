# Decisão: canal do consumidor (pedido)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling #7

## Decisão (MVP)

- Consumidor acessa **link web do cardápio digital** (compartilhável em WhatsApp/Instagram).
- **Pedido completo no navegador** (carrinho, checkout, pagamento).
- UX **mobile-first** (mesmo sendo web; a maioria pede no celular).
- **Sem** bot WhatsApp e **sem** API oficial Meta/WhatsApp Business no MVP.

### Acompanhamento no MVP (escopo mínimo)

Após o pedido, oferecer compartilhamento fácil no WhatsApp, ex.: botão **"Acompanhar meu pedido"** que abre `wa.me` do **número do comerciante** com texto pré-preenchido (nº do pedido, itens, total, endereço/retirada).

- Não é provedor de WhatsApp; é deep link.
- Não aumenta escopo de integração; só UX de handoff.

## Pós-MVP (gravado, fora do escopo agora)

- Disparos de **marketing** via WhatsApp (campanhas, reativação, etc.).
- Possível evolução para avisos automáticos via provedor/API oficial — **não** decidir provedor agora.

## Explicitamente fora do MVP

- Bot de cardápio/pedido dentro do WhatsApp.
- WhatsApp Cloud API / BSP como dependência do go-live.
- App nativo do consumidor.
