// Contrato do service binding admin → api (entrypoint `PainelApi`, RPC). O navegador do
// Painel nunca fala com a api: o servidor do admin chama estes métodos pelo binding `API`.
import type {
  InviteMemberInput,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  SwitchActiveStoreInput,
} from "./auth/schemas.js";
import type { ActiveStore, RpcResult, SessionCtx } from "./auth/types.js";
import type {
  AdminMenu,
  MenuCopyComplementGroupsInput,
  MenuCreateAdditionalInput,
  MenuCreateCategoryInput,
  MenuCreateComplementGroupInput,
  MenuCreateItemInput,
  MenuDeleteAdditionalInput,
  MenuDeleteCategoryInput,
  MenuDeleteComplementGroupInput,
  MenuDeleteItemInput,
  MenuReorderAdditionalsInput,
  MenuReorderCategoriesInput,
  MenuReorderComplementGroupsInput,
  MenuReorderItemsInput,
  MenuUpdateAdditionalInput,
  MenuUpdateCategoryInput,
  MenuUpdateComplementGroupInput,
  MenuUpdateItemInput,
  MenuUploadedImage,
  MenuUploadImageInput,
} from "./menu/admin.js";

export type ApiHealth = {
  status: "ok" | "degraded";
  service: "api";
  database: "ok" | "unavailable";
};

/**
 * Quem chama a RPC: o admin repassa o header `cookie` do navegador (sessão Better Auth no
 * domínio do Painel) e o IP de `cf-connecting-ip` (rate limit). A api resolve sessão, papel e
 * Loja a partir disso — nunca de um id de usuário/Loja enviado pelo admin.
 */
export type PainelCaller = {
  cookie: string;
  ip: string | null;
};

export type StoreMemberView = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: ActiveStore["role"];
};

export interface PainelRpc {
  health(): Promise<ApiHealth>;

  /**
   * HTTP só pelo binding: o admin repassa `/api/auth/*` (Better Auth) para cá, com o header
   * `cf-connecting-ip` sobrescrito pelo próprio admin. Set-Cookie volta para o domínio do Painel.
   */
  fetch(request: Request): Promise<Response>;

  /** Sessão atual com a Loja ativa revalidada; null se não autenticado. */
  session(caller: PainelCaller): Promise<SessionCtx | null>;

  /** Troca a Loja ativa se houver membership; senão `forbidden` e nada muda. */
  switchActiveStore(
    caller: PainelCaller,
    input: SwitchActiveStoreInput,
  ): Promise<RpcResult<ActiveStore>>;

  /** Membros da Loja ativa (Dono). */
  listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>>;

  /**
   * Dono convida para a Loja ativa: cria o usuário se não existir, cria a membership e envia o
   * link de definir senha (token de uso único) pela MillionSend. Usuário já existente só ganha a
   * membership e um aviso por e-mail. Turnstile + rate limit.
   */
  inviteMember(
    caller: PainelCaller,
    input: InviteMemberInput,
  ): Promise<RpcResult<{ membershipId: string }>>;

  /** Ops convida o Dono de qualquer Loja; mesmo provisionamento de `inviteMember`. */
  opsInviteOwner(
    caller: PainelCaller,
    input: OpsInviteOwnerInput,
  ): Promise<RpcResult<{ membershipId: string }>>;

  /**
   * Dono remove membro da Loja ativa; o acesso cai na request seguinte (a membership é lida a
   * cada request). Sem outra membership, as sessões do usuário são revogadas.
   */
  removeMember(caller: PainelCaller, input: RemoveMemberInput): Promise<RpcResult<null>>;

  // ---- Cardápio (Ticket 23). Só o Dono da Loja ATIVA (`can(role, "store.menu")`); Operador e
  // Ops recebem `forbidden`. Entradas validadas com os schemas `menu*InputSchema` de
  // `@foode/shared/menu` (`invalid_input`). A Loja vem do StoreContext; id de outra Loja ou
  // inexistente = `not_found`. Reordenar com conjunto de ids diferente do gravado = `conflict`.

  /** Cardápio completo da Loja ativa (inclui indisponíveis), na ordem do Dono. */
  menuGet(caller: PainelCaller): Promise<RpcResult<AdminMenu>>;

  menuCreateCategory(
    caller: PainelCaller,
    input: MenuCreateCategoryInput,
  ): Promise<RpcResult<{ categoryId: string }>>;

  menuUpdateCategory(
    caller: PainelCaller,
    input: MenuUpdateCategoryInput,
  ): Promise<RpcResult<null>>;

  /** Categoria com itens = `conflict`. */
  menuDeleteCategory(
    caller: PainelCaller,
    input: MenuDeleteCategoryInput,
  ): Promise<RpcResult<null>>;

  menuReorderCategories(
    caller: PainelCaller,
    input: MenuReorderCategoriesInput,
  ): Promise<RpcResult<null>>;

  /** `featured: true` além de MAX_FEATURED_ITEMS (4) = `conflict`; imagem de outra Loja ou ausente no R2 = `invalid_input`. */
  menuCreateItem(
    caller: PainelCaller,
    input: MenuCreateItemInput,
  ): Promise<RpcResult<{ itemId: string }>>;

  /** Preço/disponibilidade/destaque inline usam esta RPC com um campo (P-CAR-5, CAR-02, P-5.5). */
  menuUpdateItem(caller: PainelCaller, input: MenuUpdateItemInput): Promise<RpcResult<null>>;

  /** Apaga item, grupos, opções e Adicionais; tenta apagar a imagem no R2 (só da Loja). */
  menuDeleteItem(caller: PainelCaller, input: MenuDeleteItemInput): Promise<RpcResult<null>>;

  menuReorderItems(caller: PainelCaller, input: MenuReorderItemsInput): Promise<RpcResult<null>>;

  menuCreateComplementGroup(
    caller: PainelCaller,
    input: MenuCreateComplementGroupInput,
  ): Promise<RpcResult<{ groupId: string }>>;

  /** `options` = lista completa na nova ordem (com `id` atualiza, sem cria, ausente apaga). */
  menuUpdateComplementGroup(
    caller: PainelCaller,
    input: MenuUpdateComplementGroupInput,
  ): Promise<RpcResult<null>>;

  menuDeleteComplementGroup(
    caller: PainelCaller,
    input: MenuDeleteComplementGroupInput,
  ): Promise<RpcResult<null>>;

  menuReorderComplementGroups(
    caller: PainelCaller,
    input: MenuReorderComplementGroupsInput,
  ): Promise<RpcResult<null>>;

  /** P-CAR-1: copia grupos de outro item da mesma Loja (ids novos, no fim do item alvo). */
  menuCopyComplementGroups(
    caller: PainelCaller,
    input: MenuCopyComplementGroupsInput,
  ): Promise<RpcResult<{ groupIds: string[] }>>;

  menuCreateAdditional(
    caller: PainelCaller,
    input: MenuCreateAdditionalInput,
  ): Promise<RpcResult<{ additionalId: string }>>;

  menuUpdateAdditional(
    caller: PainelCaller,
    input: MenuUpdateAdditionalInput,
  ): Promise<RpcResult<null>>;

  menuDeleteAdditional(
    caller: PainelCaller,
    input: MenuDeleteAdditionalInput,
  ): Promise<RpcResult<null>>;

  menuReorderAdditionals(
    caller: PainelCaller,
    input: MenuReorderAdditionalsInput,
  ): Promise<RpcResult<null>>;

  /**
   * Upload da foto pelos bytes (decisão 64): o servidor do admin repassa o arquivo; a api confere
   * JPEG/PNG/WebP ≤ 5 MiB pela assinatura dos bytes, grava em `stores/{store_id}/menu/{uuid}.{ext}`
   * pelo binding `MEDIA` e devolve a chave (para gravar no item) e a URL pública. Bytes que não
   * batem com `contentType` = `invalid_input`. Só Dono; rate limit por usuário (`rate_limited`).
   */
  menuUploadImage(
    caller: PainelCaller,
    input: MenuUploadImageInput,
  ): Promise<RpcResult<MenuUploadedImage>>;
}
