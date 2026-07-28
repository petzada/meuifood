# Decisão: migração do piloto para subconta BaaS

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #4  
**Depende de:** [47](47-tomadora-baas-ltda-apos-piloto.md) · [49](49-novos-clientes-so-apos-baas.md) · [24](24-arquitetura-pagamentos.md)

## Decisão

Quando o BaaS estiver homologado na **LTDA**:

1. O **comerciante-modelo** migra: `pilot_platform` → `baas` (subconta Asaas sob a LTDA).  
2. Encerra-se a custódia/repasse no **MEI** do founder para esse lojista.  
3. **Todos os novos** comerciantes já nascem em `baas` (ativação manual — [49](49-novos-clientes-so-apos-baas.md)).

## Por quê

- Um único modo operacional pós-escala.  
- Fecha risco de chargeback/custódia/MEI do piloto.  
- Alinha amigo-piloto ao mesmo modelo dos ~10 lojas.

## Rejeitado

- Deixar o piloto eterno em `pilot_platform` enquanto só os novos usam `baas`.  
- Migrar o piloto para `merchant_own_account` em vez de subconta Foode.

## Implicação mínima de produto/código

- Troca = **config do modo** da loja + secrets/credenciais da subconta (já previsto em [24](24-arquitetura-pagamentos.md)).  
- Ledger de repasse do piloto deixa de ser caminho feliz após a migração (histórico pode permanecer).  
- Sem UI self-serve de “criar subconta” obrigatória no MVP — ops/manual ok.
