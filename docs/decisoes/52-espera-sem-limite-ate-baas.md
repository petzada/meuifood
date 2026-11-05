# Decisão: espera sem limite até BaaS (sem escape hatch comercial)

> **Arquivada em 2026-11-04 por [60](60-pagamentos-efi-abacatepay.md):** a trilha BaaS Asaas não é mais o caminho de escala; o modo pós-piloto é decisão aberta. Mantida só como histórico.

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #6  
**Depende de:** [49](49-novos-clientes-so-apos-baas.md) · [24](24-arquitetura-pagamentos.md)

## Decisão

Se a homologação BaaS atrasar após a LTDA / pedido formal:

- **Esperar sem limite** de calendário.  
- **Zero novos comerciantes** até `baas` liberado.  
- O **comerciante-modelo** continua sozinho (piloto / depois migração — [50](50-migracao-piloto-para-baas.md)).  
- **Não** destravar `merchant_own_account` como plano comercial de contingência.  
- **Não** usar período de avaliação (10 / R$ 2k / 60d) para escalar.

## Por quê

- Founder aceita travar GTM multi-loja em troca de um único caminho limpo (`baas` sob LTDA).  
- Evita fricção de onboarding conta-por-lojista e risco do teto de avaliação.

## Nota técnica

O modo `merchant_own_account` pode permanecer no **enum de código** ([24](24-arquitetura-pagamentos.md)) por flexibilidade futura; **não** é política comercial vigente deste grilling. Ativar exige **nova decisão** explícita (não é fallback automático).

## Rejeitado

- Contingência comercial via `merchant_own_account` após “atraso inaceitável”.  
- Escalar no período de avaliação Asaas.
