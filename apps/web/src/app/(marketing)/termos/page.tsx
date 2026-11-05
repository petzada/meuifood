import type { Metadata } from "next";

import { LegalPage } from "../../../components/marketing/legal-page";
import {
  ANNUAL_INSTALLMENT_CENTS,
  ANNUAL_INSTALLMENT_TOTAL_CENTS,
  ANNUAL_INSTALLMENTS,
  ANNUAL_PRICE_CENTS,
  formatBRL,
  MONTHLY_TIERS,
  tierLabel,
} from "../../../content/pricing";
import { LEGAL, SITE_URL } from "../../../content/site";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Termos de uso da Foode Delivery para lojistas: mensalidade por faixa, plano anual, repasse, taxas do pagamento online, reembolso em 7 dias e tarifa de serviço do consumidor.",
  alternates: { canonical: "/termos" },
};

// Única página pública que cita a tarifa de serviço do Consumidor (decisão 71).
// TODO(31-juridico): revisão jurídica antes de publicar; o valor da tarifa vem de @foode/shared
// quando a constante existir (Ticket 26); até lá, o texto registra R$ 1,50 da decisão 71.
const CONSUMER_SERVICE_FEE = "R$ 1,50";

export default function TermsPage() {
  return (
    <LegalPage
      subtitle="Condições para o lojista que contrata a Foode Delivery e para quem faz pedidos nas lojas."
      title="Termos de uso"
      updatedAt="2026-11-05"
    >
      <h2>1. Quem somos</h2>
      <p>
        A plataforma Foode Delivery (“Foode”) é operada por {LEGAL.razaoSocial}, CNPJ {LEGAL.cnpj},
        com sede em {LEGAL.cidade}, SP, acessível em {SITE_URL}. Estes termos regem o uso do site,
        do cardápio digital das lojas (“Storefront”), do painel do lojista e do atendimento
        comercial.
      </p>

      <h2>2. O serviço</h2>
      <p>
        A Foode fornece ao lojista um cardápio digital com link próprio, recebimento de pedidos,
        pagamento online por PIX e cartão de crédito, fila de pedidos, cupons e relatórios. A Foode
        não prepara nem entrega pedidos: a relação de consumo do pedido é entre o consumidor e a
        loja.
      </p>

      <h2>3. Cadastro da loja</h2>
      <p>
        O cadastro é feito pela equipe Foode a partir do contato comercial. O lojista é responsável
        pela veracidade dos dados, pelo conteúdo do cardápio (itens, preços, fotos, alérgenos) e
        pelo cumprimento das normas sanitárias e fiscais aplicáveis.
      </p>

      <h2>4. Mensalidade e faixas</h2>
      <p>
        O plano mensal é cobrado por faixa de pedidos não cancelados recebidos pelo cardápio digital
        no mês civil:
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Faixa</th>
            <th scope="col">Mensalidade</th>
          </tr>
        </thead>
        <tbody>
          {MONTHLY_TIERS.map((tier) => (
            <tr key={tier.minOrders}>
              <td>{tierLabel(tier)}</td>
              <td>{formatBRL(tier.priceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        A faixa é apurada pela plataforma e informada no painel. A cobrança da mensalidade é feita
        fora do aplicativo, por PIX ou cartão, de forma pré-paga; a loja recebe pedidos enquanto o
        plano estiver ativo. Não há comissão por pedido. Não há fidelidade nem multa de
        cancelamento; o cancelamento vale a partir do fim do período já pago.
      </p>

      <h2>5. Plano anual e parcelamento</h2>
      <p>
        O plano anual custa {formatBRL(ANNUAL_PRICE_CENTS)} à vista, com pedidos ilimitados por 12
        meses. Pode ser parcelado em até {ANNUAL_INSTALLMENTS} vezes no cartão, com juros de 2,99%
        ao mês (Tabela Price): {ANNUAL_INSTALLMENTS}× de {formatBRL(ANNUAL_INSTALLMENT_CENTS)},
        total de {formatBRL(ANNUAL_INSTALLMENT_TOTAL_CENTS)}. O valor do plano anual não é
        reajustado durante a vigência.
      </p>

      <h2>6. Reembolso integral em até 7 dias</h2>
      <p>
        O lojista pode desistir em até 7 dias corridos contados do pagamento da primeira mensalidade
        ou do plano anual, por qualquer motivo, com devolução integral do valor pago pelo mesmo meio
        de pagamento, em até 10 dias úteis. Após esse prazo não há reembolso de períodos já pagos.
        Taxas de pagamento online de pedidos já processados não são reembolsáveis.
      </p>

      <h2>7. Pagamento online, taxas e repasse</h2>
      <p>
        Pedidos pagos por PIX ou cartão de crédito têm uma taxa Foode por transação (percentual e,
        quando houver, valor fixo), informada por escrito no cadastro da loja e visível no painel. O
        pagamento na entrega não tem taxa. O cartão tem dois modos: Normal e Rápido (recebimento em
        D+1), com taxas distintas. O valor líquido dos pedidos é repassado em lote diário por loja,
        1 dia útil após a liberação pelo provedor de pagamento, para a conta bancária cadastrada.
        Pedidos cancelados têm estorno ao consumidor; a taxa Foode do pedido estornado não é
        cobrada.
      </p>

      <h2>8. Tarifa de serviço do consumidor</h2>
      <p>
        Em pedidos pagos online (PIX ou cartão) é cobrada do consumidor uma tarifa de serviço de{" "}
        {CONSUMER_SERVICE_FEE} por pedido, exibida como linha própria na última etapa do checkout e
        no comprovante. A tarifa é calculada depois de itens, complementos, adicionais, entrega e
        cupom, não é afetada por cupons, pertence integralmente à Foode e não compõe o repasse ao
        lojista. Pedidos pagos na entrega não têm tarifa. Em estorno total, a tarifa também é
        devolvida.
      </p>

      <h2>9. Uso do cardápio digital pelo consumidor</h2>
      <p>
        O consumidor faz o pedido como visitante, informando nome, WhatsApp e, no delivery, o
        endereço. O pagamento online é à vista (uma parcela). O acompanhamento do pedido fica num
        link enviado ao consumidor. Dúvidas sobre o pedido devem ser tratadas com a loja; a Foode
        presta suporte à loja.
      </p>

      <h2>10. Responsabilidades e limites</h2>
      <ul>
        <li>
          A Foode se compromete com a disponibilidade razoável do serviço, sem garantia de nível de
          serviço (SLA) contratual.
        </li>
        <li>O lojista responde pelo conteúdo que publica e pelos pedidos que aceita.</li>
        <li>
          A Foode pode suspender lojas que violem a lei ou estes termos, com aviso prévio quando
          possível.
        </li>
      </ul>

      <h2>11. Dados pessoais</h2>
      <p>
        O tratamento de dados do lojista, do consumidor e dos contatos comerciais segue a{" "}
        <a href="/privacidade">Política de privacidade</a>.
      </p>

      <h2>12. Alterações e foro</h2>
      <p>
        Estes termos podem ser atualizados; a versão vigente é a publicada nesta página, com a data
        de atualização. Fica eleito o foro da comarca de {LEGAL.cidade}, SP. Contato: {LEGAL.email}.
      </p>
    </LegalPage>
  );
}
