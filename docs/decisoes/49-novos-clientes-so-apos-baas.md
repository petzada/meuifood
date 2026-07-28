# Decisão: novos comerciantes só após BaaS homologado

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling BaaS #3  
**Depende de:** [47](47-tomadora-baas-ltda-apos-piloto.md) · [48](48-gatilho-piloto-validado-ltda.md) · [24](24-arquitetura-pagamentos.md) · [54](54-implicacoes-minimas-modo-baas.md)

## Decisão

- Durante piloto e na janela LTDA → homologação: **apenas 1 comerciante-modelo**.  
- **Próximos comerciantes esperam** BaaS homologado; ativação **manual pela Foode** via **UI de onboarding de subconta no `admin`** ([54](54-implicacoes-minimas-modo-baas.md)) — sem self-serve aberto de pagamento.  
- **Não** usar `merchant_own_account` nem o período de avaliação (10 / R$ 2k / 60d) para escalar nessa janela.  
- Espera **sem limite** de calendário até BaaS — [52](52-espera-sem-limite-ate-baas.md).

## Por quê

- Evita custódia multi-lojista no MEI e evita teto inviável de avaliação.  
- Alinha GTM consultivo (~10 lojas) a um único modo alvo: `baas` sob a LTDA.  
- Ativação manual (assistida) cabe no ritmo “sem pressa”.

## Rejeitado (nesta fase)

- Onboard em `merchant_own_account` enquanto BaaS pendente.  
- Operar novos lojistas no período de avaliação Asaas.  
- Prospectar 2º+ sob `pilot_platform`.

## Nota

O enum `merchant_own_account` em [24](24-arquitetura-pagamentos.md) permanece no desenho de código; **política comercial** = espera sem limite até BaaS — [52](52-espera-sem-limite-ate-baas.md).
