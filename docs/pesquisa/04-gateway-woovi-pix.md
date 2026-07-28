# Pesquisa: gateway Woovi (PIX) — jul/2026

**Data:** jul/2026 · **Tipo:** validação de custos / fit para SaaS de cardápio (cobrar lojistas)  
**Hipótese do founder:** R$ 0,80 fixo **OU** 0,80% por PIX → **parcialmente desatualizada** (fixo público atual = **R$ 0,85**).

## 1. Preços PIX (público)

Fonte: [Planos e Preços](https://woovi.com/planos-e-precos/), [FAQ Conta Virtual](https://developers.woovi.com/docs/faq/faq-virtual-account), [Taxa Maquininha PIX](https://developers.woovi.com/docs/pix-machine/what-is-the-fee-charged-by-woovi).

| Plano / item | Taxa pública | Observação |
| --- | --- | --- |
| **Plano Percentual** | **0,80%** por Pix confirmado | **Mín. R$ 0,50** · **máx. R$ 5,00** |
| **Plano Fixo** | **R$ 0,85** por Pix confirmado | Não é R$ 0,80 |
| **Alto Volume** | Sob consulta | “Falar com vendas” |
| Mensalidade / adesão | **Grátis** | Conta PJ de pagamentos inclusa |
| Gerar QRCode | **Grátis** | Cobra só no recebimento |
| Pix avulso (chave aleatória) | **R$ 0,50** | FAQ Transações |
| Saque | **R$ 1,00** se &lt; R$ 500; **grátis** ≥ R$ 500 | Página de preços; FAQ docs tem nuance (manual &lt; R$ 1.000) |
| Split | **Grátis** (listado) | Feature pode exigir habilitação pelo suporte |
| Reembolso | **Grátis** | Total/parcial |

**Validação founder (jul/2026):** custo **negociado** com a Woovi = **R$ 0,80 fixo** *ou* **0,80%** por PIX — usar esse número no modelo de negócio interno. A tabela pública (**R$ 0,85** / 0,80% com piso-teto) fica só como referência de mercado.

## 2. Settlement / recebimento

- **Confirmação PIX:** tempo real (webhooks / status em tempo real).
- **Saque para conta bancária:** via Pix, **instantâneo 24×7** ([FAQ Saques](https://developers.woovi.com/docs/faq/faq-withdraw)).
- **Saque automático:** por padrão diário (ex.: **19h**); mínimo configurável (padrão **R$ 500**).
- **Destino do saque da conta principal:** **somente chave Pix do CNPJ** da empresa.
- **Ativação conta virtual:** verificação em até **~48h**.
- Há **reserva de segurança** (norma Bacen) sobre parte do saldo.

## 3. Plataforma / marketplace / split

Sim — modelo plataforma é suportado ([Intro Split](https://developers.woovi.com/docs/splits/split-introduction), [FAQ Split](https://ajuda.woovi.com/hc/duvidas-frequentes/articles/o-que-e-o-split-pix-e-como-ele-funciona)):

| Modelo | Quem recebe | KYC do lojista | Fit SaaS cardápio |
| --- | --- | --- | --- |
| **SPLIT_SUB_ACCOUNT** | Conta principal + “caixinhas” virtuais; saque sob demanda p/ chave Pix | Leve: só chave Pix (CPF/CNPJ/e-mail/tel.) | Onboarding rápido; **saldo fica sob controle da plataforma** até o saque |
| **SPLIT_PARTNER** | Afiliado tem conta virtual **própria (CNPJ)**; parceiro fica com taxa/markup | Completo (KYC PJ por loja) | Mais compliance; feature de **parceiro** |
| **Wallet / BAAS** | Contas sob CNPJ do parceiro / onboarding KYC | CNPJ + docs | Exige features **BAAS** / parceria |

**Alertas:** Split (esp. parceiro/wallet) pode precisar **habilitação comercial/suporte**. Subconta **não** é conta bancária real.

## 4. CNPJ / MEI / KYC

- Conta operacional / saque principal: **PJ com CNPJ** (chave Pix CNPJ).
- **MEI é aceito** em BAAS: docs da empresa **dispensados**; exigem docs dos sócios (selfie + CNH ou RG) — [Documentos BAAS](https://developers.woovi.com/docs/baas/documents-nescessary).
- LTDA/etc.: contrato social / ata / estatuto conforme natureza.
- Onboarding merchant (plataforma): CNPJ obrigatório na API KYC (`taxID` = CNPJ) — [KYC Onboarding](https://developers.woovi.com/docs/baas/kyc/kyc-api-onboarding-create).
- **PF pura (só CPF) não abre conta principal** no modelo padrão de saque CNPJ; CPF só entra como chave de **subconta** (repasse).

## 5. Links oficiais

- Preços: https://woovi.com/planos-e-precos/
- Devs (OpenPix/Woovi): https://developers.woovi.com/
- Conta virtual / taxas: https://developers.woovi.com/docs/faq/faq-virtual-account
- Saques: https://developers.woovi.com/docs/faq/faq-withdraw
- Split: https://developers.woovi.com/docs/splits/split-introduction
- Docs BAAS/KYC: https://developers.woovi.com/docs/baas/documents-nescessary
- Ajuda Split: https://ajuda.woovi.com/hc/duvidas-frequentes/articles/o-que-e-o-split-pix-e-como-ele-funciona
- Instituição: Woovi IP LTDA — CNPJ 54.811.417/0001-63 (rodapé do site)

## Implicação rápida para o SaaS

Para ticket típico de delivery (~R$ 30–80): no plano **0,80%** quase sempre cai no **piso R$ 0,50**; no **fixo R$ 0,85** o custo é constante. Confirmar em comercial qual plano/feature (split/BAAS) será liberado para modelo multi-loja.
