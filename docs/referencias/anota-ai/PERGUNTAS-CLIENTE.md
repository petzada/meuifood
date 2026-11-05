# Perguntas ao Dono — o que aparece no fluxo do concorrente e a nossa spec não prevê

**Data:** 2026-11-05 · **Fonte:** [`CLIENTE/`](CLIENTE/) · **Mapa:** [MAPA-UX-CLIENTE.md](MAPA-UX-CLIENTE.md) · **Diretrizes:** [DIRETRIZES-UX-CLIENTE.md](DIRETRIZES-UX-CLIENTE.md)

Cada pergunta traz o print de referência, a avaliação de UX do padrão, as opções com a **recomendada** marcada (✅) e o porquê em uma linha. Nenhuma decisão fechada é reaberta: quando o print contradiz uma decisão, isso aparece como "diverge da decisão N". Resposta curta basta (ex.: "1.1 A, 1.2 B…").

## 1. Cardápio e item

**P-1.1 — Opção de Complemento pode ter preço (sabor que define o preço, borda +R$ 9,90 com "escolha até 1")?**
Print: `11`, `12`, `14`. Avaliação: boa prática e essencial para pizzaria/lanchonete (ICP); hoje Complemento não tem preço e Adicional tem preço mas não tem grupo nem máximo — a borda seria um Adicional sem limite, permitindo duas bordas.
- ✅ **A. Sim: `priceCents` opcional (padrão 0) na opção de Complemento, entrando no contrato do Ticket 23 antes do port.**
- B. Não: manter Complemento sem preço e bordas como Adicionais.
- Porquê: o contrato ainda não foi mergeado (`feat/23-pre`); mudar agora custa pouco, depois exige migration e recálculo.

**P-1.2 — Pizza meio a meio (2 sabores num item)?**
Print: `09` (categoria "Pizzas Meio a Meio"; fluxo não capturado). Avaliação: muito pedido no segmento, mas a regra de preço (maior, média) é um motor à parte; a decisão 13 tira combos/motores dedicados do MVP.
- A. Sim, no MVP, preço pelo sabor mais caro.
- ✅ **B. Não no MVP; quem precisar usa Complemento "Sabores" com até 2 opções (se P-1.1 = A, o preço vem da opção).**
- Porquê: cobre o caso comum sem criar regra nova de preço.

**P-1.3 — Preço promocional "de/por" com selo de % no item?**
Print: `04`, `05`, `14`. Avaliação: reforça urgência e é comum, mas o print 14 mostra o risco (preço riscado unitário ao lado do total da linha); Cupom promocional já cobre promoção no MVP (decisão 62).
- A. Sim, campo "preço original" opcional no item.
- ✅ **B. Não no MVP.**
- Porquê: evita um segundo mecanismo de desconto ao lado do Cupom antes de validar a operação.

**P-1.4 — Busca de itens no Cardápio?**
Print: `04`. Avaliação: boa prática para cardápio longo (> 30 itens); custo baixo se filtrar no navegador sobre o Cardápio já carregado, sem API.
- ✅ **A. Sim, no Ticket 23, filtro no cliente enquanto digita.**
- B. Não; só abas de categoria.
- Porquê: alto valor para pizzarias com dezenas de sabores, sem custo de servidor.

**P-1.5 — Observação por item ("Ex.: sem cebola")?**
Print: `05`, `06`, `14`. Avaliação: boa prática no segmento (reduz ligação para a Loja); o Ticket 24 já fala em "observações" no cupom 80 mm, mas o contrato do carrinho não tem o campo.
- ✅ **A. Sim: texto opcional até 140 caracteres na linha do carrinho, no snapshot do Pedido e na impressão.**
- B. Não; só observação geral do Pedido (P-2.3).
- Porquê: é o que o Consumidor espera, e linhas iguais com observação diferente precisam ficar separadas no carrinho.

## 2. Checkout e dados do Consumidor

**P-2.1 — Buscar dados do cliente pelo telefone e preencher sozinho (como o "Buscando dados do cliente…")?**
Print: `17`. Avaliação: anti-padrão de privacidade — quem digitar o telefone de outra pessoa vê nome/endereço dela; diverge da decisão 43 (vínculo exige e-mail + telefone e não atravessa Lojas).
- A. Sim, consulta no servidor por Loja.
- ✅ **B. Não.**
- Porquê: risco LGPD sem ganho que o P-2.2 não entregue com segurança.

**P-2.2 — Lembrar nome, telefone e endereço no próprio aparelho para o próximo Pedido?**
Print: `17`, `19` (o concorrente "lembra" pelo servidor). Avaliação: boa prática (Baymard: reduzir redigitação no recompra) quando fica no aparelho, com controle do usuário.
- ✅ **A. Sim: `Checkbox` "Lembrar meus dados neste aparelho" (marcado por padrão), `localStorage` por Loja, link "Esquecer meus dados".**
- B. Sim, sem opção de desmarcar.
- C. Não.
- Porquê: tira a maior fricção da recompra sem criar base de dados nova.

**P-2.3 — Observação geral do Pedido ("Ex.: apertar a campainha")?**
Print: `35`. Avaliação: boa prática, recolhida por padrão; hoje só existe "Referência" do endereço.
- ✅ **A. Sim: até 200 caracteres, no Pedido, no detalhe do Painel e na impressão 80 mm (Ticket 24).**
- B. Não; "Referência" basta.
- Porquê: separa recado de entrega da referência do endereço e vale também para Retirada.

**P-2.4 — Mostrar previsão de tempo ("Entre 35–55 min") configurada pelo Dono?**
Print: `20`, `31`. Avaliação: boa prática (expectativa clara reduz contato com a Loja); exige campo de configuração.
- ✅ **A. Sim: faixa mín–máx opcional por Fulfillment no Ticket 24; vazio = não mostra.**
- B. Não no MVP.
- Porquê: um campo simples, alto valor percebido, sem compromisso de SLA.

**P-2.5 — Pedido mínimo por Loja?**
Print: `02` (mensagem no carrinho não capturada). Avaliação: regra comum em delivery; boa prática se aparecer antes do checkout com quanto falta.
- ✅ **A. Sim, opcional (padrão desligado), sobre o subtotal de itens, checado no servidor na mesma escrita do Pedido (Ticket 24).**
- B. Não no MVP.
- Porquê: Lojas de bairro usam isso para não sair para entregar pedido pequeno; o custo é uma regra e uma mensagem.

## 3. Endereço

**P-3.1 — Preencher endereço pelo CEP (ViaCEP/BrasilAPI)?**
Print: `22`. Avaliação: reduz digitação, mas depende de serviço externo e o bairro do CEP nem sempre bate com a lista da Loja; diverge do comentário do Ticket 09 (sem CEP no MVP).
- A. Sim, CEP opcional que preenche rua e bairro.
- ✅ **B. Não no MVP.**
- Porquê: no modo bairro quem manda é a lista da Loja; o ganho não paga a dependência agora.

**P-3.2 — "Usar minha localização" (geolocalização)?**
Print: `21`/`22`. Avaliação: útil com mapa e taxa por distância; sem isso vira só pedido de permissão; diverge da decisão 42 (km/raio pós-MVP) e do Ticket 09 (sem geocoding).
- A. Sim.
- ✅ **B. Não.**
- Porquê: não há uso para a coordenada no MVP.

**P-3.3 — Mostrar o endereço da Loja no Storefront (com link para o mapa)?**
Print: `03`. Avaliação: necessário para Retirada e dá confiança; o concorrente deixa o lojista ocultar (só visto do lado lojista).
- ✅ **A. Sim, quando a Retirada estiver ativa (e no "Sobre a Loja").**
- B. Sempre.
- C. Nunca.
- Porquê: quem vai buscar precisa saber onde; quem só entrega pode preferir não expor.

**P-3.4 — Vários endereços salvos ("Escolha onde receber")?**
Print: `20`. Avaliação: bom para quem tem conta; para Guest vira cadastro escondido.
- A. Sim, para Consumidor com conta (Ticket 13).
- ✅ **B. Não no MVP; o P-2.2 lembra um endereço no aparelho.**
- Porquê: a conta do Ticket 13 ainda não existe e o ganho é marginal.

## 4. Pagamento

**P-4.1 — Dividir "Pagar na entrega" em Dinheiro e Cartão (maquininha)?**
Print: `29`. Avaliação: boa prática (a Loja sabe se leva troco ou maquininha); diverge da spec, que tem um único `on_delivery`.
- ✅ **A. Sim, como detalhe do `on_delivery` (`cash` | `card`), sem novo meio nem efeito no Ledger.**
- B. Não; um único "Pagar na entrega".
- Porquê: informação operacional que evita ligação e viagem perdida, sem mexer em pagamento online.

**P-4.2 — Campo "Troco para" quando for Dinheiro?**
Print: `30`. Avaliação: necessidade real; o modal do concorrente é excesso e o exemplo (R$ 50 para total de R$ 170,58) é inválido.
- ✅ **A. Sim, inline sob "Dinheiro", opcional, validado ≥ total, exibido no Pedido e na impressão.**
- B. Não; o Consumidor usa a observação.
- Porquê: dado estruturado que o entregador precisa, com validação simples.

**P-4.3 — Listar bandeiras aceitas na maquininha (configurável pelo Dono)?**
Print: `03`. Avaliação: 15 chips são ruído; quase toda maquininha aceita as principais.
- A. Sim, lista configurável.
- ✅ **B. Não; no máximo um texto livre do Dono no futuro.**
- Porquê: configuração e UI novas para pouco efeito na conversão.

**P-4.4 — Incentivar o PIX ("Aprovação na hora" / "Mais rápido")?**
Print: `26`, `30`. Avaliação: nudge legítimo se for informação verdadeira e discreta; o atalho "Pagar com Pix" dentro do modal de troco é anti-padrão (desvia a tarefa).
- ✅ **A. Sim: descrição "Aprovação na hora" na opção PIX, sem selo chamativo nem atalho em outros passos.**
- B. Sim, com selo e atalho como o concorrente.
- C. Não.
- Porquê: informa sem pressionar e favorece o meio que gera receita e confirma o Pedido mais cedo.

**P-4.5 — Carteiras (Google Pay, Nubank, "Pagar com iFood")?**
Print: `26`. Avaliação: diverge da decisão 60 e da spec (débito/carteiras só se o Ticket 27 comprovar suporte no checkout transparente).
- A. Planejar já no MVP.
- ✅ **B. Não; aguardar a avaliação do Ticket 27.**
- Porquê: a decisão já existe e define o gatilho.

## 5. Navegação e Loja

**P-5.1 — Sheet "Sobre a Loja" (horários da semana, endereço, meios aceitos, pedido mínimo)?**
Print: `02`, `03`. Avaliação: boa prática (condições antes do checkout); o concorrente usa rota própria, desnecessária.
- ✅ **A. Sim, sheet aberto por "Sobre a Loja" no cabeçalho, com dados que já existem (Ticket 24; meios no 26/27).**
- B. Não; só a linha de estado.
- Porquê: responde dúvidas que hoje viram mensagem no WhatsApp da Loja.

**P-5.2 — Barra inferior de abas (Início / Pedidos / Carrinho)?**
Print: `04`. Avaliação: compete com o CTA fixo e com a barra do carrinho; "Pedidos" pressupõe histórico, que o Guest não tem.
- A. Sim.
- ✅ **B. Não; barra "Ver carrinho" + link para o Pedido atual.**
- Porquê: menos chrome na tela pequena e nenhuma aba vazia para Guest.

**P-5.3 — Tema escuro?**
Print: `01` (ícone de lua). Avaliação: baixo valor num fluxo curto; duplica tokens e QA de contraste.
- A. Sim.
- ✅ **B. Não.**
- Porquê: custo de manutenção sem efeito em conversão.

**P-5.4 — Botão compartilhar (Loja e item)?**
Print: `01`, `05`. Avaliação: boa prática para Canal próprio (divulgação pelo próprio Consumidor); Web Share API é barata.
- ✅ **A. Sim, Web Share API com fallback "Copiar link", na Loja e no item (Tickets 23/28).**
- B. Não.
- Porquê: o Canal próprio cresce por indicação, e o link do item já existe (I1).

**P-5.5 — Carrossel de "Destaques" escolhidos pelo Dono?**
Print: `01` (não confirmado no print). Avaliação: carrosséis têm baixa interação; exige flag e ordenação no Cardápio.
- A. Sim.
- ✅ **B. Não no MVP; o Dono ordena categorias e pode criar uma categoria "Destaques".**
- Porquê: mesmo efeito com o que já existe.

## 6. Confiança e LGPD

**P-6.1 — Texto "Ao fazer o pedido, você concorda com a Política de Privacidade" com link?**
Print: `28`, `31`. Avaliação: boa prática de transparência (LGPD); exige uma página de política da Foode.
- ✅ **A. Sim; texto do Dono/jurídico numa página estática do Storefront, linkada acima do CTA (Ticket 24 ou 30).**
- B. Não no MVP.
- Porquê: o checkout coleta telefone e endereço; informar a finalidade é obrigação, não enfeite.

**P-6.2 — Selo "Ambiente seguro" no checkout?**
Print: `16`–`31`. Avaliação: selo genérico sem verificação tem efeito fraco; o que dá confiança é marca consistente, HTTPS e dizer para que o dado serve.
- A. Sim, como o concorrente.
- ✅ **B. Não; usar a linha de finalidade "Usamos só para preparar e entregar este pedido."**
- Porquê: comunica o mesmo com informação real.

## 7. Cupom

**P-7.1 — Mostrar lista de Cupons disponíveis além do campo de código?**
Print: `32` (parâmetro `manual_code_only=1` indica que existe "carteira de promoções"). Avaliação: útil com muitas promoções; expõe Cupons que o Dono pode querer só para um público.
- A. Sim, lista dos Cupons ativos.
- ✅ **B. Não; só código digitado (o de boas-vindas chega pela conta, Ticket 13).**
- Porquê: mantém o Cupom como ferramenta de divulgação controlada pelo Dono.
