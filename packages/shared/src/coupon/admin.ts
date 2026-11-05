// Contrato do Painel para Cupons (Ticket 13; CUP-01 a CUP-05, P-CUP-1/3/5): entradas das RPCs do
// Dono (`store.settings`; Operador e Ops = `forbidden`), visões da lista e modelos que só preenchem
// o formulário (nada é ativado sem o Dono salvar). Validado no admin e de novo na api.
import { z } from "zod";

import { centsSchema } from "../money.js";
import { weekdaySchema } from "../order/hours.js";
import {
  type CouponDiscountRule,
  type CouponKind,
  couponCodeSchema,
  type CouponStatus,
} from "./rules.js";

const optionalPositiveCents = centsSchema
  .min(1)
  .nullish()
  .transform((value) => value ?? null);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "use AAAA-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "data inválida");

const optionalDate = dateSchema.nullish().transform((value) => value ?? null);

/** Desconto: % (1–100) com teto opcional, ou R$ fixo. */
const discountShape = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("percent"),
    percent: z.number().int().min(1).max(100),
    maxDiscountCents: optionalPositiveCents,
  }),
  z.object({ kind: z.literal("fixed"), amountCents: centsSchema.min(1) }),
]);

const couponFields = z.object({
  code: couponCodeSchema,
  minOrderCents: optionalPositiveCents,
  startsOn: optionalDate,
  endsOn: optionalDate,
  /** Dias ISO (1 = segunda … 7 = domingo); vazio = todos os dias. */
  weekdays: z
    .array(weekdaySchema)
    .max(7)
    .default([])
    .refine((days) => new Set(days).size === days.length, "dia repetido"),
  usageLimit: z
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .nullish()
    .transform((value) => value ?? null),
  active: z.boolean().default(true),
});

function refinePeriod(
  value: { startsOn: string | null; endsOn: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.startsOn && value.endsOn && value.startsOn > value.endsOn) {
    ctx.addIssue({
      code: "custom",
      message: "o fim precisa ser depois do início",
      path: ["endsOn"],
    });
  }
}

/** Cupom promocional (criar). */
export const couponCreateInputSchema = z
  .intersection(couponFields, discountShape)
  .superRefine(refinePeriod);
export type CouponCreateInput = z.input<typeof couponCreateInputSchema>;
export type CouponCreateData = z.output<typeof couponCreateInputSchema>;

/** Editar = formulário inteiro de novo (substitui os campos), com o id do Cupom. */
export const couponUpdateInputSchema = z
  .intersection(couponFields.extend({ couponId: z.string().uuid() }), discountShape)
  .superRefine(refinePeriod);
export type CouponUpdateInput = z.input<typeof couponUpdateInputSchema>;
export type CouponUpdateData = z.output<typeof couponUpdateInputSchema>;

export const couponRefInputSchema = z.object({ couponId: z.string().uuid() });
export type CouponRefInput = z.input<typeof couponRefInputSchema>;

export const couponSetActiveInputSchema = z.object({
  couponId: z.string().uuid(),
  active: z.boolean(),
});
export type CouponSetActiveInput = z.input<typeof couponSetActiveInputSchema>;

/** Cupom de boas-vindas (CUP-04): interruptor + desconto + pedido mínimo opcional. */
export const welcomeCouponInputSchema = z.intersection(
  z.object({ active: z.boolean(), minOrderCents: optionalPositiveCents }),
  discountShape,
);
export type WelcomeCouponInput = z.input<typeof welcomeCouponInputSchema>;
export type WelcomeCouponData = z.output<typeof welcomeCouponInputSchema>;

// ---- Visões -----------------------------------------------------------------------------

export type CouponView = {
  id: string;
  code: string;
  discount: CouponDiscountRule;
  minOrderCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  /** Dias ISO marcados; vazio = todos os dias. */
  weekdays: number[];
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  status: CouponStatus;
  createdAt: string;
  updatedAt: string;
};

export type WelcomeCouponView = {
  active: boolean;
  discount: CouponDiscountRule | null;
  minOrderCents: number | null;
  /** Usos (Pedidos com o boas-vindas) nesta Loja. */
  redeemedCount: number;
};

export type CouponsOverview = {
  /** Seção própria no topo de `/cupons` (CUP-04). */
  welcome: WelcomeCouponView;
  coupons: CouponView[];
  templates: readonly CouponTemplate[];
};

// ---- Modelos (P-CUP-5, CUP-05): só preenchem o formulário -------------------------------

export type CouponTemplate = {
  id: "first_order_10" | "fixed_5_over_40" | "weekday_15";
  label: string;
  /** Valores para o formulário; o Dono escolhe o código e salva. */
  fill: {
    kind: CouponKind;
    percent: number | null;
    amountCents: number | null;
    maxDiscountCents: number | null;
    minOrderCents: number | null;
    weekdays: number[];
    usageLimit: number | null;
    suggestedCode: string;
  };
};

export const COUPON_TEMPLATES: readonly CouponTemplate[] = [
  {
    id: "first_order_10",
    label: "10% na primeira compra",
    fill: {
      kind: "percent",
      percent: 10,
      amountCents: null,
      maxDiscountCents: null,
      minOrderCents: null,
      weekdays: [],
      usageLimit: null,
      suggestedCode: "BEMVINDO10",
    },
  },
  {
    id: "fixed_5_over_40",
    label: "R$ 5 acima de R$ 40",
    fill: {
      kind: "fixed",
      percent: null,
      amountCents: 500,
      maxDiscountCents: null,
      minOrderCents: 4000,
      weekdays: [],
      usageLimit: null,
      suggestedCode: "GANHE5",
    },
  },
  {
    id: "weekday_15",
    label: "15% de segunda a quinta (até R$ 20)",
    fill: {
      kind: "percent",
      percent: 15,
      amountCents: null,
      maxDiscountCents: 2000,
      minOrderCents: null,
      weekdays: [1, 2, 3, 4],
      usageLimit: 100,
      suggestedCode: "SEMANA15",
    },
  },
];
