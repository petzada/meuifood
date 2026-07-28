# Grilling (grill-with-docs) — homologação BaaS Asaas · MEI vs LTDA

**Data:** jul/2026 · **Status:** em andamento · **Último:** pergunta #1 (aguardando)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md) · **Âncoras:** [24](24-arquitetura-pagamentos.md) · [06](06-gateways-taxas-e-tiers.md) · [30](30-grilling-lacunas-e-contrapontos.md) item M  
**Não reabre:** tese produto/stack, taxas [32], meios MVP [34], UI

## Objetivo

Entendimento compartilhado sobre:

1. O que a Asaas exige hoje para homologar BaaS / subcontas / split  
2. MEI é suficiente como **Tomadora**? Quando LTDA vira necessário  
3. Melhor caminho para escalar além do amigo-piloto  
4. Checklist de evidências  
5. Implicações mínimas de produto/código (`baas` vs o já em [24]/[32]/[34])

## Âncoras (não reabrir)

- SaaS canal próprio; piloto 1º cliente em `pilot_platform` (MEI founder + ledger de repasse)  
- Novos clientes só após BaaS **ou** fallback `merchant_own_account`  
- Woovi PIX + Asaas cartão  

## Fechado nesta sessão

| # | Decisão |
| --- | --- |
| — | _(ainda nenhuma)_ |

## Fatos Asaas/Bacen (pré-grilling, docs oficiais)

| Fato | Fonte |
| --- | --- |
| Conta raiz precisa **CNPJ** (CPF não cria subcontas) | [docs subcontas](https://docs.asaas.com/docs/criacao-de-subcontas) |
| Subconta pode ser `companyType: MEI` | docs criar subconta / BaaS |
| BaaS = liberação prévia com **gerente de contas** + playbook marca Asaas (Res. Conjunta 16/17) | [docs BaaS](https://docs.asaas.com/docs/cria%C3%A7%C3%A3o-de-subcontas-baas) |
| Período de avaliação: **10** subcontas · **R$ 2.000**/subconta · **60 dias** | [FAQ avaliação](https://docs.asaas.com/docs/faq-periodo-de-avaliacao) |
| `apiKey` de subconta só continua pós-homologação BaaS (ou filiais mesmo prefixo CNPJ) | docs criação de subcontas |
| Tomadora = **pessoa jurídica** BR; Foode **não** precisa de licença Bacen (Asaas = Prestadora) | [blog Asaas / Res. 16](https://blog.asaas.com/regulamentacao-baas/) |
| **Não há** FAQ público dizendo “Tomadora deve ser LTDA” — só PJ/CNPJ | lacuna → confirmar com gerente |

## Próxima pergunta

**#1** — Conta raiz da Tomadora: tentar homologar BaaS no **MEI** Foode e só abrir LTDA se Asaas/limite MEI bloquear, **ou** abrir LTDA antes do primeiro contato de homologação?
