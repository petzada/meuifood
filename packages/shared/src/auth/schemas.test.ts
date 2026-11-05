import { describe, expect, it } from "vitest";

import {
  can,
  emailSchema,
  inviteMemberInputSchema,
  loginInputSchema,
  memberStatusSchema,
  opsInviteOwnerInputSchema,
  removeMemberInputSchema,
  requestPasswordResetInputSchema,
  resendInviteInputSchema,
  roleSchema,
  setPasswordInputSchema,
  switchActiveStoreInputSchema,
} from "./index.js";

const STORE_ID = "5d0b2c1e-8a41-4f6e-9a3b-2f1c7e9d4a10";
const TOKEN = "turnstile-token";

describe("emailSchema", () => {
  it("normaliza espaços e maiúsculas", () => {
    expect(emailSchema.parse("  Dono@Loja.COM.br ")).toBe("dono@loja.com.br");
  });

  it.each(["", "sem-arroba", "a@", "@b.com", `${"a".repeat(250)}@b.com`])("recusa %s", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe("loginInputSchema", () => {
  it("aceita e-mail, senha e token", () => {
    const parsed = loginInputSchema.parse({
      email: "OPS@foode.com.br",
      password: "x",
      turnstileToken: TOKEN,
    });
    expect(parsed.email).toBe("ops@foode.com.br");
  });

  it("recusa sem Turnstile, senha vazia ou longa demais", () => {
    expect(loginInputSchema.safeParse({ email: "a@b.co", password: "segredo12" }).success).toBe(
      false,
    );
    expect(
      loginInputSchema.safeParse({ email: "a@b.co", password: "", turnstileToken: TOKEN }).success,
    ).toBe(false);
    expect(
      loginInputSchema.safeParse({
        email: "a@b.co",
        password: "x".repeat(129),
        turnstileToken: TOKEN,
      }).success,
    ).toBe(false);
  });
});

describe("requestPasswordResetInputSchema", () => {
  it("exige e-mail válido e token", () => {
    expect(
      requestPasswordResetInputSchema.safeParse({ email: "a@b.co", turnstileToken: TOKEN }).success,
    ).toBe(true);
    expect(requestPasswordResetInputSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
  });
});

describe("setPasswordInputSchema", () => {
  const valid = {
    token: "tok",
    newPassword: "senha-boa-1",
    confirmPassword: "senha-boa-1",
    turnstileToken: TOKEN,
  };

  it("aceita senha de 8 a 128 com confirmação igual", () => {
    expect(setPasswordInputSchema.safeParse(valid).success).toBe(true);
  });

  it("recusa senha curta, longa, confirmação diferente e token vazio", () => {
    const short = { ...valid, newPassword: "1234567", confirmPassword: "1234567" };
    const long = { ...valid, newPassword: "x".repeat(129), confirmPassword: "x".repeat(129) };
    expect(setPasswordInputSchema.safeParse(short).success).toBe(false);
    expect(setPasswordInputSchema.safeParse(long).success).toBe(false);
    expect(setPasswordInputSchema.safeParse({ ...valid, token: "" }).success).toBe(false);
    const mismatch = setPasswordInputSchema.safeParse({ ...valid, confirmPassword: "outra-senha" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

describe("inviteMemberInputSchema", () => {
  it("aceita Dono/Operador sem storeId (a Loja vem da sessão)", () => {
    const parsed = inviteMemberInputSchema.parse({
      email: "Op@Loja.com",
      role: "operator",
      turnstileToken: TOKEN,
    });
    expect(parsed).toEqual({ email: "op@loja.com", role: "operator", turnstileToken: TOKEN });
  });

  it("recusa papel global e descarta storeId enviado no body", () => {
    expect(
      inviteMemberInputSchema.safeParse({
        email: "a@b.co",
        role: "foode_ops",
        turnstileToken: TOKEN,
      }).success,
    ).toBe(false);
    const parsed = inviteMemberInputSchema.parse({
      email: "a@b.co",
      role: "owner",
      storeId: STORE_ID,
      turnstileToken: TOKEN,
    });
    expect(parsed).not.toHaveProperty("storeId");
  });

  it("recusa nome em branco", () => {
    expect(
      inviteMemberInputSchema.safeParse({
        email: "a@b.co",
        role: "owner",
        name: "   ",
        turnstileToken: TOKEN,
      }).success,
    ).toBe(false);
  });
});

describe("opsInviteOwnerInputSchema", () => {
  it("exige storeId UUID", () => {
    const base = { email: "dono@loja.com", turnstileToken: TOKEN };
    expect(opsInviteOwnerInputSchema.safeParse({ ...base, storeId: STORE_ID }).success).toBe(true);
    expect(opsInviteOwnerInputSchema.safeParse({ ...base, storeId: "loja-1" }).success).toBe(false);
    expect(opsInviteOwnerInputSchema.safeParse(base).success).toBe(false);
  });
});

describe("switchActiveStoreInputSchema e removeMemberInputSchema", () => {
  it("aceitam só UUID", () => {
    expect(switchActiveStoreInputSchema.safeParse({ storeId: STORE_ID }).success).toBe(true);
    expect(switchActiveStoreInputSchema.safeParse({ storeId: "1 OR 1=1" }).success).toBe(false);
    expect(removeMemberInputSchema.safeParse({ membershipId: STORE_ID }).success).toBe(true);
    expect(removeMemberInputSchema.safeParse({ membershipId: "" }).success).toBe(false);
    expect(resendInviteInputSchema.safeParse({ membershipId: STORE_ID }).success).toBe(true);
    expect(resendInviteInputSchema.safeParse({ membershipId: "m1" }).success).toBe(false);
  });
});

describe("memberStatusSchema", () => {
  it("só convite enviado ou ativo", () => {
    expect(memberStatusSchema.options).toEqual(["invited", "active"]);
    expect(memberStatusSchema.safeParse("pending").success).toBe(false);
  });
});

describe("política", () => {
  it("Operador só Pedidos; Ops só /ops; Dono a Loja", () => {
    expect(roleSchema.options).toEqual(["foode_ops", "owner", "operator"]);
    expect(can("operator", "orders.update_status")).toBe(true);
    expect(can("operator", "store.members")).toBe(false);
    expect(can("foode_ops", "ops.area")).toBe(true);
    expect(can("foode_ops", "orders.view")).toBe(false);
    expect(can("owner", "store.members")).toBe(true);
    expect(can("owner", "ops.area")).toBe(false);
  });
});
