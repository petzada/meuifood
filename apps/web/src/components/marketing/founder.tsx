// Seção do fundador (decisão 70): card da largura da página, fundo sólido (primary-soft,
// único fill suave permitido), dois parágrafos. TEXTO PROVISÓRIO para revisão do Dono; as
// objeções do 2º parágrafo vêm de temas públicos recorrentes (Reclame Aqui, 2026-11) sobre
// plataformas do setor: cobrança após o pedido de cancelamento, cancelamento só no fim da
// vigência, suporte lento e taxas que só aparecem no contrato.
import { FOUNDER } from "../../content/site";

export function Founder() {
  return (
    <article
      aria-labelledby="fundador-title"
      className="rounded-[var(--radius-container)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-6 md:p-12"
      data-reveal
    >
      <p className="mk-eyebrow">Quem está por trás</p>
      <h2 className="mk-h2 mt-3" id="fundador-title">
        Uma carta do fundador
      </h2>
      <div className="mt-6 grid gap-5 text-[1.0625rem] leading-relaxed text-[var(--color-body)] md:grid-cols-2 md:gap-10">
        <p>
          Eu sou o {FOUNDER.name}, {FOUNDER.role}. Antes de escrever uma linha de código, passei
          meses ouvindo donos de hamburgueria, pizzaria e marmitaria explicando a mesma conta: a
          comissão do marketplace comendo a margem do pedido de um cliente que já era deles. A Foode
          nasceu para ser o canal desse cliente — um link simples, com cardápio, pagamento e fila de
          pedidos — operado por uma empresa pequena de São Paulo, que atende lojista por lojista,
          sem robô de vendas.
          {/* TODO(31-dono): revisar a história pessoal (como fundou, quando). */}
        </p>
        <p>
          As reclamações mais comuns que lojistas publicam sobre plataformas do setor são sempre as
          mesmas: cobrança que continua depois de pedir o cancelamento, “sem fidelidade” que só vale
          no fim da vigência, suporte que não responde e taxa que só aparece no contrato. Por isso a
          Foode é assim: sem fidelidade de verdade, reembolso integral em até 7 dias, as taxas de
          PIX e cartão combinadas por escrito no cadastro, e o cadastro da loja feito pela nossa
          equipe, com uma pessoa do outro lado.
          {/* TODO(31-dono): confirmar os temas e a formulação antes de publicar. */}
        </p>
      </div>
      <p className="mt-6 text-sm font-bold text-[var(--color-ink)]">
        — {FOUNDER.name}, {FOUNDER.role}
      </p>
    </article>
  );
}
