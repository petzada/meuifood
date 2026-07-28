# Decisão: implicações mínimas de `baas` (+ UI onboarding no admin)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #8  
**Depende de:** [24](24-arquitetura-pagamentos.md) · [49](49-novos-clientes-so-apos-baas.md) · [50](50-migracao-piloto-para-baas.md) · [53](53-checklist-evidencias-baas-asaas.md)

## Decisão

Após piloto validado + BaaS na LTDA, **tudo opera em subcontas** (`baas`): piloto migra e novos nascem nesse modo.

Quando `baas` existir (pós-homologação na LTDA), o corte de produto/código é:

### Mantém (já em [24] / stack)

- Providers `woovi` / `asaas`; enum de **modo de cobrança** por loja.  
- Checkout **inalterado** na troca de modo (só config + credenciais).  
- Taxas comerciais e meios MVP: [32](32-taxas-e-assinatura-forma-unica.md) / [34](34-meios-pagamento-checkout-mvp.md) — **não** reabrir.  
- **Ledger de repasse** = caminho feliz só em `pilot_platform`; após migração do piloto ([50](50-migracao-piloto-para-baas.md)), deixa de ser obrigatório no fluxo.

### Acrescenta para `baas`

- **UI no `admin`** de **onboarding de subconta** Asaas (criar/acompanhar subconta, docs/`onboardingUrl`, guardar `apiKey`+`walletId` com segurança).  
- Ativação continua **manual** no sentido de [49](49-novos-clientes-so-apos-baas.md): não é self-serve aberto a qualquer lojista antes da Foode liberar; o painel é a ferramenta do founder/ops (e depois do fluxo assistido).  
- Evidência de **marca Asaas** (Res. 16/17) nos pontos exigidos pelo playbook (onboarding/comprovantes) — implementação conforme playbook recebido do gerente.

### Fora deste corte

- Redesign da stack ou dos providers.  
- UI self-serve completa de billing SaaS (já pós-MVP em [35](35-ui-billing-plano-painel.md)).  
- Usar `merchant_own_account` como plano comercial ([52](52-espera-sem-limite-ate-baas.md)).

## Rejeitado

- Só script/ops **sem** UI de onboarding no `admin`.  
- Adiar qualquer suporte a `baas` no código até a LTDA (enum/providers do MVP piloto já existem em [24](24-arquitetura-pagamentos.md)).
