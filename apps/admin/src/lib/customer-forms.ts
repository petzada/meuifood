// Formulários da conta do Consumidor no Ops (Ticket 13, decisão 65): busca por telefone ou CPF
// e troca de telefone auditada. Valida com os Zod do contrato (`@foode/shared/customer`); a api
// valida e autoriza de novo. Telefone e CPF nunca vão para URL nem para log.
import {
  opsCustomerChangePhoneInputSchema,
  opsCustomerFindInputSchema,
} from "@foode/shared/customer";

import { type FormLike, parseWith, text } from "./ops-forms";

const CUSTOMER_MESSAGES: Record<string, string> = {
  phone: "Use um celular com DDD, como (11) 91234-5678.",
  cpf: "CPF inválido: confira os 11 dígitos.",
  "custom:CPF inválido": "CPF inválido: confira os 11 dígitos.",
  form: "Informe o telefone ou o CPF.",
  accountId: "Busque a conta antes de trocar o telefone.",
};

/** `by` = "phone" | "cpf" diz qual campo vale; o outro é ignorado. */
export function parseCustomerFind(form: FormLike) {
  const by = text(form, "by") === "cpf" ? "cpf" : "phone";
  const input = by === "cpf" ? { cpf: text(form, "cpf") } : { phone: text(form, "phone") };
  const result = parseWith(opsCustomerFindInputSchema, input, CUSTOMER_MESSAGES);
  if (result.ok) return result;
  // A união devolve o erro no campo que foi usado.
  return { ok: false as const, errors: { [by]: CUSTOMER_MESSAGES[by]! } };
}

export function parseCustomerChangePhone(form: FormLike) {
  return parseWith(
    opsCustomerChangePhoneInputSchema,
    { accountId: text(form, "accountId"), phone: text(form, "phone") },
    CUSTOMER_MESSAGES,
  );
}
