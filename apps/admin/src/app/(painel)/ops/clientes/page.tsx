import { requirePermission } from "../../../../lib/session";
import { CustomerFinder } from "../_components/customer-finder";
import { OpsPageHeader } from "../_components/page-header";
import { changeCustomerPhone, findCustomer } from "../actions";

// Consumidores (Ticket 13, decisão 65): busca da conta por telefone ou CPF e troca de telefone
// auditada. Só `foode_ops`; a api confere de novo. Nada de Pedidos nem de outras Lojas aqui.
export const dynamic = "force-dynamic";

export default async function OpsCustomersPage() {
  await requirePermission("ops.area");
  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Consumidores"
        description="Conta única na Foode: um telefone e um CPF por conta. Aqui o Ops localiza a conta e troca o WhatsApp quando o Consumidor perdeu o número; a troca é auditada."
      />
      <div className="mt-8">
        <CustomerFinder changePhone={changeCustomerPhone} find={findCustomer} />
      </div>
    </section>
  );
}
