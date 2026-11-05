import type { Metadata } from "next";

import { LegalPage } from "../../../components/marketing/legal-page";
import { LEGAL } from "../../../content/site";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Como a Foode Delivery trata os dados de quem visita o site, pede nas lojas, usa o painel ou entra em contato.",
  alternates: { canonical: "/privacidade" },
};

// Reescrita (decisão 70): cobre site, Storefront, painel e leads. O smoke do deploy lê
// `/privacidade` (AGENTS.md §CI/CD): a rota continua pública e estática.
// TODO(31-juridico): revisão jurídica antes de publicar.
export default function PrivacyPage() {
  return (
    <LegalPage
      subtitle="O que coletamos, para que usamos e quais são os seus direitos, no site, no cardápio digital das lojas, no painel do lojista e no contato comercial."
      title="Política de privacidade"
      updatedAt="2026-11-05"
    >
      <h2>1. Quem trata os dados</h2>
      <p>
        {LEGAL.razaoSocial}, CNPJ {LEGAL.cnpj}, {LEGAL.cidade}, SP, operadora da Foode Delivery.
        Contato para assuntos de privacidade: {LEGAL.email}.
      </p>

      <h2>2. Site e contato comercial</h2>
      <p>
        O site não usa cookies de rastreamento nem ferramentas de analytics. Ao enviar o formulário
        de contato, guardamos nome, WhatsApp, nome da loja, cidade, volume de pedidos e a origem do
        contato, para responder à sua solicitação comercial. Não compartilhamos esses dados com
        terceiros para publicidade. Você pode pedir a exclusão a qualquer momento.
      </p>

      <h2>3. Quem pede no cardápio digital de uma loja</h2>
      <p>
        Para preparar e entregar um pedido, a loja precisa do seu nome, do seu WhatsApp e, no
        delivery, do endereço. Não pedimos e-mail, CPF nem senha para pedir. Esses dados servem para
        a loja preparar, entregar e falar com você sobre o pedido, e para a Foode operar o
        pagamento, o comprovante e o acompanhamento. A loja é responsável pelo uso que faz dos dados
        do pedido; a Foode atua como operadora da plataforma.
      </p>
      <p>
        Se você já pediu na mesma loja, pode buscar seus dados pelo WhatsApp; a resposta mostra só o
        primeiro nome e a rua, sem número, e os dados completos aparecem depois de uma verificação.
        Com “Lembrar meus dados neste aparelho” marcado, nome, WhatsApp e endereço ficam guardados
        só no seu navegador; “Esquecer meus dados” apaga tudo na hora.
      </p>
      <p>
        Lojas podem instalar o Pixel da Meta e a tag do Google no próprio cardápio para medir
        anúncios; nesse caso, a loja é a responsável por essas ferramentas e você pode bloqueá-las
        no navegador.
      </p>

      <h2>4. Pagamento online</h2>
      <p>
        PIX e cartão são processados por provedores de pagamento licenciados; a Foode não armazena o
        número completo do cartão. Guardamos o identificador da transação, o valor, o status e o
        estorno, quando houver, para o comprovante, o repasse à loja e obrigações fiscais.
      </p>

      <h2>5. Lojista e painel</h2>
      <p>
        Para operar a loja, guardamos os dados cadastrais da empresa e dos usuários do painel (nome,
        e-mail, telefone), os dados bancários para o repasse, o cardápio e o histórico de pedidos. O
        acesso ao painel é protegido por autenticação; registros de acesso são mantidos para
        segurança.
      </p>

      <h2>6. Prazo de guarda</h2>
      <p>
        Dados do pedido e do pagamento ficam guardados pelo tempo exigido por obrigações fiscais e
        de atendimento; dados de contato comercial, até a conclusão do atendimento ou o pedido de
        exclusão; dados da loja, enquanto durar o contrato e pelo prazo legal após o término.
      </p>

      <h2>7. Seus direitos (LGPD)</h2>
      <ul>
        <li>Confirmar se tratamos seus dados e acessá-los.</li>
        <li>Corrigir dados incompletos ou desatualizados.</li>
        <li>Pedir anonimização, bloqueio ou exclusão de dados desnecessários.</li>
        <li>Saber com quem compartilhamos seus dados.</li>
        <li>Revogar consentimento, quando o tratamento se basear nele.</li>
      </ul>
      <p>
        Para exercer esses direitos, escreva para {LEGAL.email} ou fale com a loja em que você
        comprou. Respondemos no prazo legal.
      </p>

      <h2>8. Infraestrutura e segurança</h2>
      <p>
        A plataforma roda em infraestrutura em nuvem com criptografia em trânsito e controles de
        acesso. Podemos usar serviços de terceiros (hospedagem, envio de e-mail, pagamento) que
        tratam dados em nosso nome, sob contrato.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Esta política pode ser atualizada; a versão vigente é a publicada nesta página, com a data
        de atualização.
      </p>
    </LegalPage>
  );
}
