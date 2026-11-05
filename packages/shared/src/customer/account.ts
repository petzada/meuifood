// Conta do Consumidor (decisões 65, 66, 68): cadastro no 1º acesso (nome + CPF validado), estado da
// sessão, "meus Pedidos" por Loja e a troca de telefone pelo Ops (auditada). Um telefone = uma conta
// e um CPF = uma conta; conflito bloqueia sem revelar dados da outra conta.
import { z } from "zod";

import { centsSchema } from "../money.js";
import { isValidCpf } from "../ops/documents.js";
import { customerNameSchema, customerPhoneSchema, phoneE164Schema } from "../order/checkout.js";
import { fulfillmentSchema, orderStatusSchema } from "../order/status.js";
import { orderAddressViewSchema } from "../order/storefront.js";

/** CPF obrigatório e validado (dígito verificador); normaliza para os 11 dígitos. */
export const cpfSchema = z
  .string()
  .transform((raw) => raw.replace(/[\s.-]/gu, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{11}$/u, "CPF inválido")
      .refine(isValidCpf, "CPF inválido"),
  );

export const customerSignupSchema = z.object({
  name: customerNameSchema,
  cpf: cpfSchema,
});
export type CustomerSignup = z.input<typeof customerSignupSchema>;

/** CPF mascarado para exibir ("***.456.789-**"): o número inteiro nunca volta ao navegador. */
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/gu, "");
  if (digits.length !== 11) return "***.***.***-**";
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Telefone mascarado ("(11) *****-4321"), para o Ops e mensagens. */
export function maskPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/gu, "");
  if (digits.length !== 13) return "(**) *****-****";
  return `(${digits.slice(2, 4)}) *****-${digits.slice(9)}`;
}

/**
 * Conta como o próprio Consumidor vê. `lastAddress` = endereço do último Pedido de Delivery da
 * conta (decisão 68: os dados da conta valem em qualquer Loja; só o endereço, sem Loja nem itens).
 */
export const customerAccountViewSchema = z.object({
  name: z.string(),
  phone: phoneE164Schema,
  cpfMasked: z.string(),
  lastAddress: orderAddressViewSchema.nullable(),
});
export type CustomerAccountView = z.infer<typeof customerAccountViewSchema>;

/** 200 de `GET /storefront/conta` (sempre 200, `no-store`). */
export const customerSessionStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("anonymous") }),
  z.object({ state: z.literal("signup_required"), phone: phoneE164Schema }),
  z.object({ state: z.literal("signed_in"), account: customerAccountViewSchema }),
]);
export type CustomerSessionState = z.infer<typeof customerSessionStateSchema>;

/** Até 50 Pedidos da conta NESTA Loja (os Guest com o telefone verificado entram no vínculo). */
export const CUSTOMER_ORDERS_LIMIT = 50;

export const customerOrderSummarySchema = z.object({
  code: z.number().int().min(1),
  status: orderStatusSchema,
  fulfillment: fulfillmentSchema,
  createdAt: z.string(),
  totalCents: centsSchema,
  trackingPath: z.string().startsWith("/"),
});
export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;

export const customerOrdersSchema = z.object({ orders: z.array(customerOrderSummarySchema) });
export type CustomerOrders = z.infer<typeof customerOrdersSchema>;

/** Sessão do Consumidor: cookie `httpOnly`, `Secure`, `SameSite=Lax`, no domínio do Storefront. */
export const CUSTOMER_SESSION_COOKIE = "__Host-foode_consumidor";
/** Sessão com conta: 30 dias. Telefone verificado aguardando nome + CPF: 15 min. */
export const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CUSTOMER_SIGNUP_TTL_SECONDS = 15 * 60;

// ---- Ops: busca e troca de telefone (decisão 65) ----------------------------------------

export const opsCustomerFindInputSchema = z.union([
  z.object({ phone: customerPhoneSchema }),
  z.object({ cpf: cpfSchema }),
]);
export type OpsCustomerFindInput = z.input<typeof opsCustomerFindInputSchema>;

export type OpsCustomerView = {
  accountId: string;
  name: string;
  phone: string;
  cpfMasked: string;
  createdAt: string;
};

export const opsCustomerChangePhoneInputSchema = z.object({
  accountId: z.string().uuid(),
  phone: customerPhoneSchema,
});
export type OpsCustomerChangePhoneInput = z.input<typeof opsCustomerChangePhoneInputSchema>;
