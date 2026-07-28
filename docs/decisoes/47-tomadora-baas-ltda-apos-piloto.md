# Decisão: MEI só no piloto; Tomadora BaaS = LTDA após validação

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #1  
**Depende de:** [24](24-arquitetura-pagamentos.md) · [46](46-grilling-homologacao-baas-mei-ltda.md) · ADR [0004](../adr/0004-modo-piloto-custodia.md)

## Decisão

| Fase | Pessoa jurídica Foode | Papel Asaas |
| --- | --- | --- |
| **Piloto** (1 comerciante) | **MEI** do founder | Conta recebedora em `pilot_platform` (custódia + ledger de repasse) — **não** Tomadora BaaS |
| **Pós-piloto validado** | Abrir **LTDA** | Conta raiz **Tomadora**; só então pedido **formal** de homologação BaaS |
| **Pós-homologação** | LTDA | Subcontas/split sem teto de avaliação; piloto migra + novos em `baas` |

- **Não** tentar homologar BaaS no MEI.  
- **Não** abrir LTDA antes do piloto validado.  
- **Sim** ter a LTDA aberta **antes** do primeiro contato **formal** de homologação com o gerente Asaas.  
- Contato **informativo** durante o piloto = permitido ([51](51-contato-informativo-asaas-piloto.md)).

## Por quê

- MEI serve para validar produto/taxas com o comerciante-modelo sem custo societário antecipado.  
- Escala multi-comerciante com subcontas: founder escolhe **LTDA** como Tomadora (não “MEI até o Asaas negar”).  
- Abrir LTDA sem produto validado é burocracia prematura; pedir BaaS formal sem LTDA contradiz a sequência escolhida.

## Rejeitado

- Homologar BaaS na conta MEI e só migrar para LTDA se bloquear.  
- Abrir LTDA agora (antes do piloto).  
- Escalar só com `merchant_own_account` (nunca ser Tomadora) — rejeitado como plano; enum pode existir no código sem ser política ([52](52-espera-sem-limite-ate-baas.md)).

## Encadeamento (fechado no grilling)

| Tema | Doc |
| --- | --- |
| Gatilho piloto validado | [48](48-gatilho-piloto-validado-ltda.md) |
| Zero novos até BaaS | [49](49-novos-clientes-so-apos-baas.md) · [52](52-espera-sem-limite-ate-baas.md) |
| Migração do piloto | [50](50-migracao-piloto-para-baas.md) |
