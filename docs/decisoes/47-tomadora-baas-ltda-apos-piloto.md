# Decisão: MEI só no piloto; Tomadora BaaS = LTDA após validação

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #1  
**Depende de:** [24](24-arquitetura-pagamentos.md) · [46](46-grilling-homologacao-baas-mei-ltda.md) · ADR [0004](../adr/0004-modo-piloto-custodia.md)

## Decisão

| Fase | Pessoa jurídica Foode | Papel Asaas |
| --- | --- | --- |
| **Piloto** (1 comerciante) | **MEI** do founder | Conta recebedora em `pilot_platform` (custódia + ledger de repasse) — **não** Tomadora BaaS |
| **Pós-piloto validado** | Abrir **LTDA** | Conta raiz **Tomadora**; só então contato de homologação BaaS |
| **Pós-homologação** | LTDA | Subcontas/split sem teto de avaliação; novos comerciantes em `baas` |

- **Não** tentar homologar BaaS no MEI.  
- **Não** abrir LTDA antes do piloto validado.  
- **Sim** ter a LTDA aberta **antes** do primeiro contato de homologação com o gerente Asaas.

## Por quê

- MEI serve para validar produto/taxas com o amigo-piloto sem custo societário antecipado.  
- Escala multi-comerciante com subcontas exige Tomadora robusta; founder escolhe LTDA como veículo (não “MEI até o Asaas negar”).  
- Abrir LTDA sem produto validado é burocracia prematura; pedir BaaS sem LTDA contradiz a sequência escolhida.

## Rejeitado

- Homologar BaaS na conta MEI e só migrar para LTDA se bloquear.  
- Abrir LTDA agora (antes do piloto).  
- Nunca ser Tomadora (escalar só com `merchant_own_account`) — fora desta decisão; fallback continua em [24](24-arquitetura-pagamentos.md).

## Aberto (próximas perguntas do grilling)

- Critério de **piloto validado** (gatilho da LTDA).  
- Janela entre LTDA aberta e BaaS liberado (2º+ comerciante).  
- Migração do piloto MEI → subconta sob LTDA.
