# 72 — Banner do Plano na sidebar do Dono, Toast padrão e ajustes do Painel após o teste em produção

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Substitui:** a P-PLN-1 da [63](63-decisoes-ux-benchmark-anota.md) · **Complementa:** [61](61-monetizacao-faixas-taxas-anota.md), [63](63-decisoes-ux-benchmark-anota.md), [64](64-revisao-adversarial-escopo-mvp.md)

Feedback do Dono testando o Painel em produção (branch `fix/painel-feedback-391f`).

## Plano na sidebar (substitui P-PLN-1)

- O progresso da faixa **não fica só na tela Plano**: o Dono vê, na sidebar, acima do rodapé (nome, função e Sair), um banner com:
  - barra de progresso que enche com os **Pedidos do mês dentro da faixa** ("128 de 150 Pedidos");
  - a faixa ("Faixa até 150 Pedidos") e o valor do Plano ("R$ 84,99/mês" ou "R$ 1.019,88/ano");
  - botão **"Ver meu plano"** → `/plano`.
- Faixa sem teto (250+) e Plano anual mostram a contagem sem barra ("312 Pedidos este mês"). Sem Plano ativo, sem banner.
- Só o Dono (Operador e Ops não veem). A leitura é a RPC `storePlanGet` (Plano vigente, faixa da contagem e Pedidos do mês), sob `store.settings`.
- **Contagem**: Pedidos **não cancelados** do mês civil de America/Sao_Paulo (`created_at` no intervalo UTC do mês), por Loja — fonte única para o Ops (lista/detalhe de Lojas) e para o Dono. Pedido PIX não pago fica fora quando existir `payment_status` (Ticket 26, `TODO(26)`).
- `/plano` mínima, só leitura: Plano, ciclo, faixa atual, contagem do mês com barra, valor e vigência; "A cobrança é feita pela equipe Foode, fora do app". O Ticket 14 completa (histórico, menu Financeiro).

## Toast padrão (todo o feedback de ação do Painel)

- Componente novo em `@foode/ui` (`ToastProvider` + `useToast`), montado no layout raiz do admin.
- **Fundo preto, texto branco** (destoa do app de propósito), minimalista, sem ícone colorido; topo-centro no desktop, largura cheia vindo do topo no celular (< 768 px).
- Some em **4 s** ou no X à direita (`aria-label="Fechar aviso"`); **no máximo 3** empilhados (o mais antigo sai); `role="status"` (erro: `role="alert"`); posição fixa — **não desloca o layout**; entrada desligada com `prefers-reduced-motion`.
- Vai para o Toast: sucesso, erro da api, conflito, aviso de redirecionamento (`?aviso=`), Pausa, copiar link, ações rápidas do Cardápio (o aviso embaixo das setas de reordenar empurrava os botões), ações da fila.
- **Não** vai para o Toast: erro de **validação de campo** — fica abaixo do campo (ver Formulários). Erro dentro de `<dialog>` modal nativo continua dentro dele (a camada do topo cobriria o Toast).
- O Storefront (`apps/web`) adota o mesmo componente depois, em outra tarefa.

## Formulários

- Erro **não apaga** o que foi digitado (o `<form action>` do React 19 reseta o formulário depois de toda action: o envio passa por `onSubmit` + transição; sucesso continua voltando aos valores do servidor).
- O campo com erro fica na cor de erro com a mensagem logo abaixo (`aria-invalid`, `aria-describedby`); a tela **rola até o primeiro campo com erro e dá foco nele**.
- **Sem resumo** "Confira os campos destacados". Só quando a api devolve erro que não casa com nenhum campo da tela a mensagem vai para o Toast.
- Todo campo de dinheiro tem máscara **"R$ 0,00" em centavos** enquanto digita.

## Diálogos sobre o Painel (P-ONB-1 e P-ONB-4 mantidas, forma nova)

- Tour da fila (3 passos) e perguntas de perfil do 1º acesso abrem no **mesmo estilo**: overlay escurecido e **desfocado**, caixa **branca sólida**, foco preso, Esc fecha (o tour; as perguntas são obrigatórias).
- Tour: cada passo com ilustração e botões próprios — (1) card em Recebidos com selo Novo e "Começar preparo"; (2) o mesmo card em Em preparo com o botão do próximo passo; (3) card aberto com Imprimir, Avisar no WhatsApp e Cancelar. Transição curta, desligada com `prefers-reduced-motion`. O tour espera as perguntas de perfil serem respondidas.

## Checklist de onboarding

- Sai o passo **"Link personalizado"**: o link que o Ops define já vale; trocar continua opcional em Configurações › Loja. Ficam: contato, horários, Entrega ou Retirada, Cardápio com item disponível e Plano ativo.

## Navegação

- Item ativo do menu pelo caminho do **cliente** (`usePathname`), não pelo header do middleware lido só no carregamento.
- **Sair** no mesmo lugar, como ícone vermelho de saída com nome acessível "Sair".
- Carregando e erro **dentro** da moldura do Painel (`(painel)/loading.tsx` e `error.tsx`): a troca de tela mostra skeleton na hora e a sidebar fica.
- `/equipe` passa a existir (listar, convidar Operador com Turnstile, remover com confirmação que nomeia a pessoa).
