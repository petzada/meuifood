// Entradas de Auth do Painel (Ticket 22), validadas no admin (formulário) e de novo na api.
// Limites de senha = padrão do Better Auth (minPasswordLength 8, maxPasswordLength 128).
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Papel numa Loja (membership). */
export const membershipRoleSchema = z.enum(["owner", "operator"]);
/** Papel global da plataforma. */
export const platformRoleSchema = z.enum(["foode_ops"]);
/** Todo papel que a política conhece. */
export const roleSchema = z.enum(["foode_ops", "owner", "operator"]);

export const storeStatusSchema = z.enum(["onboarding", "active", "suspended"]);

/** E-mail normalizado como o Better Auth grava: sem espaços e minúsculo. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Senha nova (definir/resetar). Login não aplica a política: só limita o tamanho. */
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Token do widget Turnstile (header `x-captcha-response` nos endpoints do Better Auth). */
export const turnstileTokenSchema = z.string().min(1).max(2048);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  turnstileToken: turnstileTokenSchema,
});

/** Pedir link de reset ("esqueci a senha"). A resposta é a mesma exista ou não o e-mail. */
export const requestPasswordResetInputSchema = z.object({
  email: emailSchema,
  turnstileToken: turnstileTokenSchema,
});

/** Definir senha (convite) e resetar senha usam o mesmo fluxo de token de uso único. */
export const setPasswordInputSchema = z
  .object({
    token: z.string().min(1).max(512),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
    turnstileToken: turnstileTokenSchema,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

const memberNameSchema = z.string().trim().min(1).max(120);

/** Dono convida membro para a Loja ATIVA (a Loja sai da sessão, nunca do body). */
export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  name: memberNameSchema.optional(),
  role: membershipRoleSchema,
  turnstileToken: turnstileTokenSchema,
});

/** Ops convida o Dono de uma Loja recém-cadastrada (mesmo fluxo de provisionamento). */
export const opsInviteOwnerInputSchema = z.object({
  storeId: z.uuid(),
  email: emailSchema,
  name: memberNameSchema.optional(),
  turnstileToken: turnstileTokenSchema,
});

export const removeMemberInputSchema = z.object({
  membershipId: z.uuid(),
});

/**
 * Situação do membro na Equipe (EQP-01), derivada do que já existe no banco: `active` = já
 * definiu senha (conta `credential` com senha); `invited` = convite enviado e ainda sem senha.
 */
export const memberStatusSchema = z.enum(["invited", "active"]);

/** Dono reenvia o convite de quem ainda não definiu senha (Loja ATIVA da sessão). */
export const resendInviteInputSchema = z.object({
  membershipId: z.uuid(),
});

/** Troca da Loja ativa no seletor; o servidor confere a membership antes de aceitar. */
export const switchActiveStoreInputSchema = z.object({
  storeId: z.uuid(),
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type Role = z.infer<typeof roleSchema>;
export type StoreStatus = z.infer<typeof storeStatusSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordInputSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;
export type OpsInviteOwnerInput = z.infer<typeof opsInviteOwnerInputSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
export type MemberStatus = z.infer<typeof memberStatusSchema>;
export type ResendInviteInput = z.infer<typeof resendInviteInputSchema>;
export type SwitchActiveStoreInput = z.infer<typeof switchActiveStoreInputSchema>;
