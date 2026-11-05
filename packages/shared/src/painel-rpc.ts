// Contrato do service binding admin → api (entrypoint `PainelApi`, RPC). O navegador do
// Painel nunca fala com a api: o servidor do admin chama estes métodos pelo binding `API`.
import type {
  InviteMemberInput,
  MemberStatus,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  ResendInviteInput,
  SwitchActiveStoreInput,
} from "./auth/schemas.js";
import type { ActiveStore, RpcResult, SessionCtx } from "./auth/types.js";
import type {
  CouponCreateInput,
  CouponRefInput,
  CouponSetActiveInput,
  CouponsOverview,
  CouponUpdateInput,
  WelcomeCouponInput,
} from "./coupon/admin.js";
import type {
  FinanceReport,
  OpsMarginInput,
  OpsMarginView,
  OpsPayoutAdjustmentInput,
  OpsPayoutBatchesInput,
  OpsPayoutBatchView,
  OpsPayoutMarkPaidInput,
  OpsPayoutMarkPaidResult,
  OpsPayoutsDueView,
  OwnerPayoutsInput,
  OwnerPayoutsView,
  ReportCsvExport,
  ReportInput,
} from "./finance/index.js";
import type { LeadView, OpsListLeadsInput, OpsSetLeadStatusInput } from "./lead/index.js";
import type {
  OpsCustomerChangePhoneInput,
  OpsCustomerFindInput,
  OpsCustomerView,
} from "./customer/account.js";
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
import type {
  FunnelReport,
  FunnelReportInput,
  OwnerOnboardingState,
  OwnerPlanView,
  OwnerProfileInput,
  OwnerStoreSettings,
  SlugAvailability,
  StoreContactInput,
  StorePixelsInput,
  StoreShowcaseInput,
  StoreSlugInput,
  StoreUploadBrandImageInput,
  StoreUploadedBrandImage,
} from "./onboarding/index.js";
import type {
  OpsActivateStoreInput,
  OpsAuditEntry,
  OpsCreatePaymentFeesInput,
  OpsCreateProviderCostInput,
  OpsCreateStoreInput,
  OpsEndPaymentFeeInput,
  OpsEndProviderCostInput,
  OpsListPaymentFeesInput,
  OpsPublishPlanTiersInput,
  OpsSetCardModeInput,
  OpsSetStorePlanInput,
  OpsStoreDetail,
  OpsStoreListItem,
  OpsStoreRefInput,
  OpsSuspendStoreInput,
  OpsUpdateStoreInput,
  PaymentFeeView,
  PlanTierTableView,
  ProviderCostView,
} from "./ops/index.js";
import type {
  CancelOrderResult,
  OrderCancelInput,
  OrderDetail,
  OrderRefInput,
  OrdersList,
  OrdersListInput,
  OrderTransitionInput,
  OrderTransitionResult,
  PauseState,
  StoreOperationSettings,
  StoreSetCardBrandsInput,
  StoreSetFulfillmentInput,
  StoreSetHoursInput,
  StoreSetPauseInput,
  StoreSetDeliveryRateInput,
  StoreSetPrintOnAcceptInput,
} from "./order/index.js";

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
  /** `invited` até a pessoa definir a senha pelo link do convite; depois `active`. */
  status: MemberStatus;
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

  /**
   * Dono reenvia o convite (link novo de definir senha, 72 h) a um membro da Loja ativa que
   * ainda não definiu senha (`status: "invited"`). Já ativo = `conflict`; id de outra Loja =
   * `not_found`. Rate limit por Dono (o mesmo dos convites) e por membro (1 a cada 5 min).
   * Audita `membership.invite_resent`.
   */
  resendInvite(
    caller: PainelCaller,
    input: ResendInviteInput,
  ): Promise<RpcResult<{ membershipId: string }>>;

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

  // ---- Área Ops (Ticket 29). Só `foode_ops` (OpsContext emitido por @foode/db); Dono e
  // Operador recebem `forbidden`. Entradas validadas com os schemas de `@foode/shared/ops`
  // (`invalid_input`). Toda mutação grava auditoria com `before`/`after` (OPS_AUDIT_ACTIONS).

  /** Lojas com estado, Plano, faixa do mês e checklist de onboarding. */
  opsListStores(caller: PainelCaller): Promise<RpcResult<OpsStoreListItem[]>>;

  /** Detalhe da Loja; `not_found` se não existe. */
  opsGetStore(caller: PainelCaller, input: OpsStoreRefInput): Promise<RpcResult<OpsStoreDetail>>;

  /** Cadastra a Loja em `onboarding`. Slug já usado = `conflict`. O convite do Dono é `opsInviteOwner`. */
  opsCreateStore(
    caller: PainelCaller,
    input: OpsCreateStoreInput,
  ): Promise<RpcResult<{ storeId: string }>>;

  /** Edita o cadastro (só os campos enviados). Slug já usado = `conflict`. */
  opsUpdateStore(caller: PainelCaller, input: OpsUpdateStoreInput): Promise<RpcResult<null>>;

  /**
   * Ativa (de `onboarding`) ou reativa (de `suspended`). Exige Plano vigente; transição fora de
   * STORE_STATUS_TRANSITIONS ou sem Plano = `conflict`.
   */
  opsActivateStore(caller: PainelCaller, input: OpsActivateStoreInput): Promise<RpcResult<null>>;

  /** Suspende a Loja (para de aceitar Pedidos); motivo na auditoria. */
  opsSuspendStore(caller: PainelCaller, input: OpsSuspendStoreInput): Promise<RpcResult<null>>;

  /** Modo do cartão da Loja (Normal = Efí, Rápido = AbacatePay). */
  opsSetCardMode(caller: PainelCaller, input: OpsSetCardModeInput): Promise<RpcResult<null>>;

  /** Plano da Loja (mensal/anual) a partir de `validFrom`; encerra o anterior. */
  opsSetStorePlan(
    caller: PainelCaller,
    input: OpsSetStorePlanInput,
  ): Promise<RpcResult<{ planId: string }>>;

  /** Tabelas de faixas (vigente, futuras e histórico), mais recente primeiro. */
  opsListPlanTiers(caller: PainelCaller): Promise<RpcResult<PlanTierTableView[]>>;

  /** Publica nova tabela de faixas a partir de `validFrom`; a vigente termina ali. */
  opsPublishPlanTiers(
    caller: PainelCaller,
    input: OpsPublishPlanTiersInput,
  ): Promise<RpcResult<null>>;

  /** Taxas Foode da tabela padrão (`storeId` null) ou overrides da Loja, com histórico. */
  opsListPaymentFees(
    caller: PainelCaller,
    input: OpsListPaymentFeesInput,
  ): Promise<RpcResult<PaymentFeeView[]>>;

  /** Cadastra taxas; sobreposição com o que já está gravado no mesmo meio/modo = `conflict`. */
  opsCreatePaymentFees(
    caller: PainelCaller,
    input: OpsCreatePaymentFeesInput,
  ): Promise<RpcResult<{ feeIds: string[] }>>;

  /** Encerra a vigência de uma taxa (`validTo`); não apaga nem reescreve. */
  opsEndPaymentFee(caller: PainelCaller, input: OpsEndPaymentFeeInput): Promise<RpcResult<null>>;

  /** Custos dos provedores (Ops-only), com histórico. */
  opsListProviderCosts(caller: PainelCaller): Promise<RpcResult<ProviderCostView[]>>;

  /** Novo custo de provedor; sobreposição no mesmo provedor/operação = `conflict`. */
  opsCreateProviderCost(
    caller: PainelCaller,
    input: OpsCreateProviderCostInput,
  ): Promise<RpcResult<{ costId: string }>>;

  /** Encerra a vigência de um custo de provedor. */
  opsEndProviderCost(
    caller: PainelCaller,
    input: OpsEndProviderCostInput,
  ): Promise<RpcResult<null>>;

  /** Trilha de auditoria da Loja (mais recente primeiro). */
  opsListStoreAudit(
    caller: PainelCaller,
    input: OpsStoreRefInput,
  ): Promise<RpcResult<OpsAuditEntry[]>>;

  // ---- Pedidos e configuração operacional (contrato do Ticket 24a; RPCs implementadas no 24b).
  // Loja sempre a ATIVA (StoreContext). Entradas validadas com `@foode/shared/order`
  // (`invalid_input`). Permissões da política única: `orders.view`, `orders.update_status`,
  // `orders.cancel` e `store.pause` para Dono e Operador; `store.settings` só Dono; Ops = `forbidden`.
  // Pedido de outra Loja ou inexistente = `not_found`.

  /** Fila (`active`) ou "Concluídos hoje" (`closed_today`), com chips Todos/Delivery/Retirada. */
  ordersList(caller: PainelCaller, input?: OrdersListInput): Promise<RpcResult<OrdersList>>;

  /** Detalhe do Pedido (PED-07), base da impressão 80 mm e do "Avisar no WhatsApp". */
  ordersGet(caller: PainelCaller, input: OrderRefInput): Promise<RpcResult<OrderDetail>>;

  /**
   * Avança o Pedido só por transição válida do módulo de estados (`invalid_input` se não);
   * estado atual ≠ `from` = `conflict` sem gravar. `print` = aceite com "Imprimir ao aceitar".
   */
  ordersTransition(
    caller: PainelCaller,
    input: OrderTransitionInput,
  ): Promise<RpcResult<OrderTransitionResult>>;

  /**
   * Cancela o Pedido (Dono ou Operador da própria Loja; Ticket 12) com motivo opcional e produz a
   * consequência financeira: `on_delivery` (só o Pedido), `refund` (Estorno total automático no
   * provedor que cobrou, inclusive a tarifa de serviço) ou `charge_cancel`. Já cancelado/concluído
   * ou ≠ `from` = `conflict`. Não existe comando de Estorno avulso: o Estorno só nasce aqui.
   */
  ordersCancel(
    caller: PainelCaller,
    input: OrderCancelInput,
  ): Promise<RpcResult<CancelOrderResult>>;

  /** Configuração operacional da Loja ativa (Dono e Operador leem). */
  storeOperationGet(caller: PainelCaller): Promise<RpcResult<StoreOperationSettings>>;

  /** Liga/retoma a Pausa (Dono e Operador, P-OPE-4); auditada com quem e papel. */
  storeSetPause(caller: PainelCaller, input: StoreSetPauseInput): Promise<RpcResult<PauseState>>;

  /** Horários (só Dono): grade inteira, atômica; inválida ou sobreposta = `invalid_input`. */
  storeSetHours(caller: PainelCaller, input: StoreSetHoursInput): Promise<RpcResult<null>>;

  /** Entrega (só Dono): Retirada, modo do Delivery, bairros, pedido mínimo e tempos estimados. */
  storeSetFulfillment(
    caller: PainelCaller,
    input: StoreSetFulfillmentInput,
  ): Promise<RpcResult<null>>;

  /** Bandeiras da maquininha em Débito e Crédito (só Dono). */
  storeSetCardBrands(
    caller: PainelCaller,
    input: StoreSetCardBrandsInput,
  ): Promise<RpcResult<null>>;

  /** "Imprimir ao aceitar" (só Dono). */
  storeSetPrintOnAccept(
    caller: PainelCaller,
    input: StoreSetPrintOnAcceptInput,
  ): Promise<RpcResult<null>>;

  /** R$/km do Delivery (decisão 73; só Dono); `null` limpa. Auditado. */
  storeSetDeliveryRate(
    caller: PainelCaller,
    input: StoreSetDeliveryRateInput,
  ): Promise<RpcResult<null>>;

  // ---- Onboarding do Dono, dados, vitrine, Slug, Pixel e funil (Ticket 28). Só o Dono da Loja
  // ATIVA (`can(role, "store.settings")`); Operador e Ops = `forbidden`, sem efeito. Entradas com
  // `@foode/shared/onboarding` (`invalid_input`). Toda escrita audita (ONBOARDING_AUDIT_ACTIONS).
  // QR Code: o admin gera no cliente a partir de `storeUrl` (PNG e SVG, LNK-01).

  /** Checklist calculado no servidor (sem ordem forçada; "Plano ativo" não acionável), perfil e link. */
  onboardingGet(caller: PainelCaller): Promise<RpcResult<OwnerOnboardingState>>;

  /**
   * Plano vigente, faixa do mês e Pedidos não cancelados do mês civil de São Paulo (decisão 72:
   * banner da sidebar do Dono e `/plano`, só leitura). Só Dono.
   */
  storePlanGet(caller: PainelCaller): Promise<RpcResult<OwnerPlanView>>;

  /** Duas perguntas de perfil (culinária, objetivo; uso interno da Foode): uma vez, depois `conflict`. */
  onboardingAnswerProfile(caller: PainelCaller, input: OwnerProfileInput): Promise<RpcResult<null>>;

  /** "Sua Loja está pronta" visto (aparece uma vez). Checklist incompleto = `conflict`. */
  onboardingAcknowledgeReady(caller: PainelCaller): Promise<RpcResult<null>>;

  /** Dados da Loja (contato, endereço, cadastro do Ops só leitura), vitrine e Pixel. */
  storeSettingsGet(caller: PainelCaller): Promise<RpcResult<OwnerStoreSettings>>;

  /**
   * Disponibilidade do Link personalizado enquanto digita (não reserva); considera os links antigos
   * de outras Lojas (`taken`); link antigo da própria Loja = disponível. Rate limit = `rate_limited`.
   */
  storeCheckSlug(caller: PainelCaller, input: StoreSlugInput): Promise<RpcResult<SlugAvailability>>;

  /**
   * Troca/confirma o Slug (marca o item "Slug" do checklist). Formato ou reservado =
   * `invalid_input`; atual OU antigo (histórico) de outra Loja = `conflict` (reserva, decisão 69).
   * O anterior vai para o histórico e continua funcionando (308 no Storefront); voltar a um link
   * antigo da própria Loja o tira do histórico.
   */
  storeSetSlug(
    caller: PainelCaller,
    input: StoreSlugInput,
  ): Promise<RpcResult<{ slug: string; storeUrl: string }>>;

  /** WhatsApp, Instagram e endereço (CEP obrigatório como no Ops). Loja sem cadastro = `conflict`. */
  storeSetContact(caller: PainelCaller, input: StoreContactInput): Promise<RpcResult<null>>;

  /** IDs do Pixel Meta (15–16 dígitos) e Google (`G-`/`AW-`/`GT-`); vazio apaga. */
  storeSetPixels(caller: PainelCaller, input: StorePixelsInput): Promise<RpcResult<null>>;

  /** Descrição ≤ 160, logo e capa (chaves de `storeUploadBrandImage` desta Loja). */
  storeSetShowcase(caller: PainelCaller, input: StoreShowcaseInput): Promise<RpcResult<null>>;

  /** Upload do logo/capa pelos bytes (JPEG/PNG/WebP ≤ 5 MiB) para `stores/{id}/brand/`. */
  storeUploadBrandImage(
    caller: PainelCaller,
    input: StoreUploadBrandImageInput,
  ): Promise<RpcResult<StoreUploadedBrandImage>>;

  /** Funil agregado por dia (visita → item → carrinho → checkout → Pedido); fonte do Ticket 14. */
  funnelReport(caller: PainelCaller, input: FunnelReportInput): Promise<RpcResult<FunnelReport>>;

  // ---- Cupons (Ticket 13, `/cupons` sob `store.settings`): só o Dono da Loja ATIVA; Operador e
  // Ops = `forbidden`, sem efeito. Entradas com `@foode/shared/coupon` (`invalid_input`). Toda
  // escrita audita (COUPON_AUDIT_ACTIONS). Cupom de outra Loja ou inexistente = `not_found`.

  /** Boas-vindas (topo), lista com status (Ativo/Inativo/Expirado/Esgotado/Agendado) e modelos. */
  couponsGet(caller: PainelCaller): Promise<RpcResult<CouponsOverview>>;

  /** Cria Cupom promocional; código já usado NESTA Loja = `conflict`. */
  couponCreate(
    caller: PainelCaller,
    input: CouponCreateInput,
  ): Promise<RpcResult<{ couponId: string }>>;

  /** Substitui os campos; limite abaixo dos usos ou código repetido = `conflict`. */
  couponUpdate(caller: PainelCaller, input: CouponUpdateInput): Promise<RpcResult<null>>;

  couponSetActive(caller: PainelCaller, input: CouponSetActiveInput): Promise<RpcResult<null>>;

  /** Só sem usos; com uso = `conflict` (desative em vez de apagar). */
  couponDelete(caller: PainelCaller, input: CouponRefInput): Promise<RpcResult<null>>;

  /** Interruptor e desconto do Cupom de boas-vindas (primeira compra por Loja, decisão 66). */
  welcomeCouponSet(caller: PainelCaller, input: WelcomeCouponInput): Promise<RpcResult<null>>;

  // ---- Conta do Consumidor no Ops (Ticket 13, decisão 65): só `foode_ops`.

  /** Busca por telefone ou CPF (CPF volta mascarado); sem conta = `not_found`. */
  opsCustomerFind(
    caller: PainelCaller,
    input: OpsCustomerFindInput,
  ): Promise<RpcResult<OpsCustomerView>>;

  /**
   * Troca o telefone da conta (o Consumidor não troca o próprio): auditoria com quem, quando e
   * antes/depois; Pedidos Guest do número antigo continuam na conta; sessões da conta caem.
   * Número de outra conta ou igual ao atual = `conflict`.
   */
  opsCustomerChangePhone(
    caller: PainelCaller,
    input: OpsCustomerChangePhoneInput,
  ): Promise<RpcResult<null>>;

  // ---- Leads da landing (Ticket 31, decisão 70): só `foode_ops`.

  /** Leads mais recentes primeiro (até 200); `status` filtra. */
  opsListLeads(caller: PainelCaller, input: OpsListLeadsInput): Promise<RpcResult<LeadView[]>>;

  /** Troca o status do lead (auditado); inexistente = `not_found`; mudou no meio = `conflict`. */
  opsSetLeadStatus(caller: PainelCaller, input: OpsSetLeadStatusInput): Promise<RpcResult<null>>;

  // ---- Financeiro (Ticket 14; NAV-01/02 grupo Financeiro). Dono = `store.finance` (Operador e Ops
  // = `forbidden`); Ops = `ops.area`. "Hoje" é sempre o dia civil de São Paulo do servidor.

  /**
   * Relatório da Loja ativa no período (atalho ou Personalizado até hoje): topo com comparativo vs.
   * período anterior de mesma duração, por status/Fulfillment/meio, GMV, Top 10 itens com Dom–Sáb,
   * TOP 10 clientes com conta (só nome, quantidade e total) e funil. Fim no futuro = `invalid_input`.
   */
  reportsGet(caller: PainelCaller, input: ReportInput): Promise<RpcResult<FinanceReport>>;

  /** CSV (UTF-8 com BOM, `;`, vírgula decimal) dos agregados; sem TOP 10 clientes nem dado pessoal. */
  reportsExportCsv(caller: PainelCaller, input: ReportInput): Promise<RpcResult<ReportCsvExport>>;

  /** Repasses (só leitura): lançamentos com status, totais e lotes pagos; nunca custo do provedor. */
  payoutsGet(caller: PainelCaller, input: OwnerPayoutsInput): Promise<RpcResult<OwnerPayoutsView>>;

  /** "A repassar hoje" por Loja: itens com repasse previsto até hoje, chave Pix e titular. */
  opsPayoutsDue(caller: PainelCaller): Promise<RpcResult<OpsPayoutsDueView>>;

  /**
   * Marca o lote do dia como pago (idempotente por `idempotencyKey`; imutável depois). Valor
   * diferente do confirmado, lote vazio/negativo ou Loja sem conta de repasse = `conflict`.
   */
  opsPayoutMarkPaid(
    caller: PainelCaller,
    input: OpsPayoutMarkPaidInput,
  ): Promise<RpcResult<OpsPayoutMarkPaidResult>>;

  /** Ajuste auditado (crédito/débito) que entra no próximo lote; lote de outra Loja = `not_found`. */
  opsPayoutAdjustmentCreate(
    caller: PainelCaller,
    input: OpsPayoutAdjustmentInput,
  ): Promise<RpcResult<{ adjustmentId: string }>>;

  /** Lotes pagos de uma Loja no período (data do Pix), com custo do envio. */
  opsPayoutBatches(
    caller: PainelCaller,
    input: OpsPayoutBatchesInput,
  ): Promise<RpcResult<OpsPayoutBatchView[]>>;

  /** Margem por Loja: taxa Foode − custo do provedor − custo do envio; tarifa de serviço à parte. */
  opsMarginReport(caller: PainelCaller, input: OpsMarginInput): Promise<RpcResult<OpsMarginView>>;
}
