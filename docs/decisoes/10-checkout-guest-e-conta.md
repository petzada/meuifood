# Decisão: checkout e conta do consumidor (MVP)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling #10

## Decisão

O MVP oferece **as duas formas** de pedir:

| Caminho | O que acontece |
| --- | --- |
| **Guest checkout** | Pedido sem conta; coleta **mínimos obrigatórios** |
| **Criar conta / login** | Disponível desde o MVP; **gamificação** (brindes/cupons de fidelidade) como incentivo — **se o comerciante ativar** |

### Dados mínimos no guest

- Nome completo  
- Telefone (WhatsApp)  
- Endereço (cálculo de entrega, comunicação e base para marketing WhatsApp **pós-MVP**)

### Híbrido pós-pedido (também no MVP)

1. Cliente conclui como guest (baixa fricção no 1º ponto).  
2. Após o pedido, oferecer **criar conta** + eventual **bônus/cupom de fidelidade** (opt-in do comerciante).  
3. Ao criar a conta, **vincular o pedido acabado** e iniciar o histórico.

### Login (direção, stack depois)

- Preferir **baixa fricção**: magic link ou equivalente.  
- Escolha exata de provedor/stack = **decisão posterior** (fase técnica), não bloqueia a tese de produto.

## Implicações

- Conta de consumidor existe no domínio do MVP (não só “fase 2”), mas **não é obrigatória** para o 1º pedido.  
- Fidelidade/cupom = feature **do lojista** (ligar/desligar); disponível em **todos** os planos ([11](11-planos-por-faturamento-features-completas.md)).  
- LGPD: base de telefone/endereço com finalidade clara (pedido + comunicação; marketing só com base legal adequada depois).

## Fora / posterior

- Definir provedor de auth (magic link vs OTP SMS vs etc.) na stack.  
- Motor completo de gamificação/pontos — MVP pode ser **cupom de boas-vindas ao criar conta**, não RPG de pontos.
