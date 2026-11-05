import type { Metadata } from "next";

// Política de Privacidade (P-6.1): página estática do Storefront, linkada acima de "Fazer
// pedido". TEXTO PROVISÓRIO — o Dono revisa antes de ir ao ar (marcado abaixo).
export const metadata: Metadata = {
  description: "Como a Foode Delivery trata os dados de quem pede pelo Storefront.",
  title: "Política de Privacidade | Foode Delivery",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-hairline)] px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Foode Delivery
          </p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Versão provisória · sujeita a revisão
          </p>
        </div>
      </header>

      <article className="mx-auto grid max-w-3xl gap-6 px-4 py-8 text-[var(--color-body)] md:px-8">
        <section className="grid gap-2">
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Quais dados pedimos</h2>
          <p>
            Para preparar e entregar um pedido, a Loja precisa do seu nome, do seu WhatsApp e, no
            Delivery, do endereço de entrega. Não pedimos e-mail, CPF nem senha para pedir.
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Para que usamos</h2>
          <p>
            Seus dados servem só para a Loja preparar, entregar e falar com você sobre este pedido.
            A Foode Delivery é a plataforma que a Loja usa para receber pedidos; não vendemos nem
            compartilhamos seus dados com terceiros para publicidade.
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Buscar dados pelo telefone</h2>
          <p>
            Se você já pediu na mesma Loja, pode buscar seus dados pelo WhatsApp. A resposta mostra
            só o primeiro nome e a rua, sem número, e os dados completos aparecem apenas depois que
            você confirma que é você. Cada consulta exige uma verificação de segurança, é limitada
            por aparelho e fica registrada sem o telefone em claro.
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Lembrar no aparelho</h2>
          <p>
            Com “Lembrar meus dados neste aparelho” marcado, nome, WhatsApp e endereço ficam
            guardados só no seu navegador, para a próxima compra na mesma Loja. “Esquecer meus
            dados” apaga tudo na hora.
          </p>
        </section>

        <section className="grid gap-2">
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Seus direitos</h2>
          <p>
            Você pode pedir acesso, correção ou exclusão dos seus dados à Loja em que comprou ou à
            Foode Delivery. Guardamos os dados do pedido pelo tempo necessário para cumprir
            obrigações fiscais e de atendimento.
          </p>
        </section>

        <p className="foode-outline p-4 text-sm">
          <strong className="text-[var(--color-ink)]">Revisão pendente:</strong> este texto é
          provisório e será revisado pelo responsável da Foode Delivery antes da publicação
          definitiva, com canal de contato e data de vigência.
        </p>
      </article>
    </main>
  );
}
