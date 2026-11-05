// Contextos de acesso. Só este pacote cria contextos, e só depois de conferir no banco
// (membership da Loja ou papel global). As operações recusam qualquer objeto que não
// tenha saído daqui: a marca de tipo barra o literal no typecheck e o WeakSet barra a
// falsificação em runtime (ex.: `{ storeId: "outra-loja" } as StoreContext`).
import type { MembershipRole } from "./schema";

declare const storeBrand: unique symbol;
declare const opsBrand: unique symbol;

/** Contexto de uma Loja para um membro autenticado. `storeId` veio do banco, não do request. */
export type StoreContext = {
  readonly storeId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly [storeBrand]: true;
};

/** Contexto da área Ops: usuário com papel global `foode_ops` conferido no banco. */
export type OpsContext = {
  readonly userId: string;
  readonly [opsBrand]: true;
};

const issued = new WeakSet<object>();

export function issueStoreContext(value: {
  storeId: string;
  userId: string;
  role: MembershipRole;
}): StoreContext {
  const context = Object.freeze({ ...value }) as StoreContext;
  issued.add(context);
  return context;
}

export function issueOpsContext(value: { userId: string }): OpsContext {
  const context = Object.freeze({ ...value }) as OpsContext;
  issued.add(context);
  return context;
}

export class ForgedContextError extends Error {
  constructor() {
    super("contexto não emitido por @foode/db");
    this.name = "ForgedContextError";
  }
}

export function assertIssued(context: object): void {
  if (!issued.has(context)) throw new ForgedContextError();
}
