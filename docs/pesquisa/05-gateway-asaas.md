# Pesquisa: gateway Asaas (asaas.com)

**Data:** jul/2026 · **Tipo:** research de gateway (tabela pública + docs API)  
**Nota:** taxas “padrão”; contrato real em Menu → Taxas. Promo 3 meses para novos clientes (Pix/boleto/cartão) — ex. cadastrado em 27/07/2026 → promo até ~27/10/2026.

## 1. Taxas públicas (online / cobrança)

| Meio | Taxa padrão (pós-promo) |
| --- | --- |
| **Crédito à vista** | **R$ 0,49 + 2,99%** |
| **Crédito 2–6x** | **R$ 0,49 + 3,49%** |
| **Crédito 7–12x** | **R$ 0,49 + 3,99%** |
| **Crédito 13–21x** | **R$ 0,49 + 4,29%** (só Visa/Mastercard 13–21x) |
| **Débito** | **R$ 0,35 + 1,89%** |
| **PIX (cobrança recebida)** | **R$ 1,99**/tx · promo tipicamente **R$ 0,99** nos 3 primeiros meses |
| **PIX chave / QR estático** | **100 recebimentos/mês grátis**; depois taxa contratual |
| **Boleto** | **R$ 1,99**/recebido |
| Mensalidade / adesão | **R$ 0** |
| Antecipação crédito online | **1,25%/mês** à vista · FAQ cita **1,70%/mês** parcelado |
| Antecipação boleto | **a partir de 5,79%/mês** |
| Saída PIX PJ | **30 grátis/mês**, depois **R$ 2,00**/tx · TED **R$ 5,00** |

Asaas Tap (maquininha celular): débito **1,25%**; crédito mesmos % sem +R$ 0,49; antecipação à vista **0%**.

## 2. Settlement e antecipação

| Meio | Prazo padrão |
| --- | --- |
| PIX | Alguns instantes |
| Boleto | ~D+0/D+1 útil (liquidação 2x/dia; após cut-off do banco do pagador pode ser D+2) |
| Crédito | **D+32** dias corridos por parcela (liquidação só em dia útil) |
| Débito | **D+3** úteis |

Antecipação: análise de crédito · crédito em conta em até **2 DU** (cartão) / **3 DU** (boleto/Pix) · sujeita a aprovação.

## 3. MEI

- **Pode abrir** conta digital PJ MEI (sem mensalidade); cobra só por uso.
- Antecipação disponível para MEI (com requisitos/análise).
- **Subcontas:** API exige conta raiz **CNPJ** (MEI tem CNPJ → tecnicamente elegível; CPF não). Subconta pode ser `companyType: MEI`.
- Limite operacional do MEI (CNAE, faturamento anual, atividade) continua valendo fora do Asaas — marketplace multi-lojista costuma estourar perfil MEI.

## 4. Marketplace / split / subcontas / BaaS (ex-White Label)

| Recurso | Existe? | Requisitos |
| --- | --- | --- |
| **Subcontas** (`POST /v3/accounts`) | Sim | Conta raiz **PJ (CNPJ)**; `apiKey` + `walletId` |
| **Split** | Sim (só API) | `walletId` dos destinatários; % ou valor fixo sobre **netValue** |
| **BaaS** (antigo White Label) | Sim | Liberação por **gerente de contas** + playbook Bacen (Resoluções 16/17) · marcar Asaas como instituição prestadora |
| **Filiais** | Alternativa | Mesmo prefixo CNPJ da raiz → pode manter `apiKey` sem BaaS pleno |

**Período de avaliação regulatória** (obrigatório ao criar 1ª subconta em produção):

- máx. **10** subcontas de titulares diferentes  
- máx. **R$ 2.000** em cobranças por subconta  
- **60 dias** corridos  

Após limite/prazo → bloqueio até homologação.  
**`apiKey` de subconta só permanece útil após homologação BaaS** (ou modelo filiais mesmo CNPJ). Sem isso, multi-lojista de terceiros não escala.

## 5. Links

- [Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [Cartão](https://www.asaas.com/cobranca-cartao) · [Antecipação](https://www.asaas.com/antecipacao-de-recebiveis)
- [Prazo de recebimento](https://central.ajuda.asaas.com/hc/pt-br/articles/31689840437019-Em-quanto-tempo-receberei-as-cobran%C3%A7as-pagas-pelos-meus-clientes)
- [Taxas Pix](https://central.ajuda.asaas.com/hc/pt-br/articles/32040230167067-Quais-s%C3%A3o-as-taxas-para-receber-via-Pix)
- Docs: [Subcontas](https://docs.asaas.com/docs/criacao-de-subcontas) · [BaaS](https://docs.asaas.com/docs/cria%C3%A7%C3%A3o-de-subcontas-baas) · [Split](https://docs.asaas.com/docs/split-de-pagamentos) · [Criar subconta](https://docs.asaas.com/reference/criar-subconta)
- [Regulamentação BaaS](https://blog.asaas.com/regulamentacao-baas/) · [Conta MEI](https://blog.asaas.com/conta-mei/)

## Risco principal (founder MEI + multi-lojista)

**Bloqueio/escala de marketplace:** sem homologação BaaS (e estrutura societária adequada), subcontas de terceiros ficam presas em 10 lojas / R$ 2k / 60 dias e a `apiKey` não segue — MEI sozinho não é caminho robusto para plataforma que recebe de clientes finais de vários lojistas.
