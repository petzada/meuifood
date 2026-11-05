// Entrypoint RPC do Painel. Exportado como classe nomeada do Worker: só um service
// binding com `"entrypoint": "PainelApi"` (o do admin) chega aqui; o fetch público não.
// Toda operação recebe o `PainelCaller` (cookie da sessão Better Auth + IP), passa pelo guard
// (auth/guard.ts), que confere a membership em @foode/db, e só então opera com o
// StoreContext/OpsContext emitido pelo pacote. As regras ficam em painel-service.ts.
import { createFoodeDb } from "@foode/db";
import type { ApiHealth, PainelCaller, PainelRpc, StoreMemberView } from "@foode/shared";
import type {
  ActiveStore,
  InviteMemberInput,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  RpcResult,
  SessionCtx,
  SwitchActiveStoreInput,
} from "@foode/shared/auth";
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
} from "@foode/shared/menu";
import type {
  FunnelReport,
  FunnelReportInput,
  OwnerOnboardingState,
  OwnerProfileInput,
  OwnerStoreSettings,
  SlugAvailability,
  StoreContactInput,
  StorePixelsInput,
  StoreShowcaseInput,
  StoreSlugInput,
  StoreUploadBrandImageInput,
  StoreUploadedBrandImage,
} from "@foode/shared/onboarding";
import type {
  CouponCreateInput,
  CouponRefInput,
  CouponSetActiveInput,
  CouponsOverview,
  CouponUpdateInput,
  WelcomeCouponInput,
} from "@foode/shared/coupon";
import type { LeadView, OpsListLeadsInput, OpsSetLeadStatusInput } from "@foode/shared/lead";
import type {
  OpsCustomerChangePhoneInput,
  OpsCustomerFindInput,
  OpsCustomerView,
} from "@foode/shared/customer";
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
} from "@foode/shared/ops";
import type {
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
} from "@foode/shared/order";
import * as Sentry from "@sentry/cloudflare";
import { WorkerEntrypoint } from "cloudflare:workers";

import { apiHealth } from "./app";
import { AUTH_BASE_PATH, createAuth, panelUrlOf } from "./auth/auth";
import { createTurnstileVerifier } from "./auth/turnstile";
import { createCouponService, type CouponService } from "./coupon-service";
import { createOpsCustomerService, type OpsCustomerService } from "./customer-service";
import { createMillionSendSender } from "./email/sender";
import type { Env } from "./env";
import { mediaBaseUrl } from "./media";
import { createMenuService, type MenuService } from "./menu-service";
import { createOnboardingService, type OnboardingService } from "./onboarding-service";
import { createOpsService, type OpsService } from "./ops-service";
import { createOrderService, type OrderService } from "./order-service";
import { createPainelService, type PainelService } from "./painel-service";

export class PainelApi extends WorkerEntrypoint<Env> implements PainelRpc {
  private deps() {
    const email = createMillionSendSender(this.env);
    const waitUntil = (promise: Promise<unknown>) => this.ctx.waitUntil(promise);
    return { email, waitUntil, auth: createAuth(this.env, { email, waitUntil }) };
  }

  private service(): PainelService {
    const { email, waitUntil, auth } = this.deps();
    return createPainelService({
      db: createFoodeDb(this.env.DB),
      auth,
      email,
      waitUntil,
      turnstile: createTurnstileVerifier(this.env),
      panelUrl: panelUrlOf(this.env),
    });
  }

  /** Cardápio (Ticket 23): só Dono da Loja ativa; regras em menu-service.ts. */
  private menu(): MenuService {
    const { auth } = this.deps();
    return createMenuService({
      db: createFoodeDb(this.env.DB),
      auth,
      media: this.env.MEDIA,
      mediaBaseUrl: mediaBaseUrl(this.env.MEDIA_PUBLIC_BASE_URL),
    });
  }

  /** Área Ops (Ticket 29): só `foode_ops`; regras em ops-service.ts. */
  private ops(): OpsService {
    const { auth } = this.deps();
    return createOpsService({ db: createFoodeDb(this.env.DB), auth });
  }

  /** Pedidos e configuração operacional (Ticket 24a; telas no 24b): order-service.ts. */
  private orders(): OrderService {
    const { auth } = this.deps();
    return createOrderService({
      db: createFoodeDb(this.env.DB),
      auth,
      orderTokenSecret: this.env.ORDER_TOKEN_SECRET,
    });
  }

  /** Onboarding, dados, vitrine, Slug, Pixel e funil (Ticket 28): onboarding-service.ts. */
  private onboarding(): OnboardingService {
    const { auth } = this.deps();
    return createOnboardingService({
      db: createFoodeDb(this.env.DB),
      auth,
      media: this.env.MEDIA,
      mediaBaseUrl: mediaBaseUrl(this.env.MEDIA_PUBLIC_BASE_URL),
    });
  }

  /** Cupons e boas-vindas (Ticket 13): só Dono da Loja ativa; coupon-service.ts. */
  private coupons(): CouponService {
    const { auth } = this.deps();
    return createCouponService({ db: createFoodeDb(this.env.DB), auth });
  }

  /** Conta do Consumidor no Ops (Ticket 13): busca e troca de telefone; customer-service.ts. */
  private opsCustomers(): OpsCustomerService {
    const { auth } = this.deps();
    return createOpsCustomerService({ db: createFoodeDb(this.env.DB), auth });
  }

  /** Falha inesperada: registra sem dados da request e propaga (o admin mostra erro genérico). */
  private async run<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "erro desconhecido";
      console.error(JSON.stringify({ level: "error", message, rpc: name }));
      throw new Error("internal_error");
    }
  }

  async health(): Promise<ApiHealth> {
    return apiHealth(createFoodeDb(this.env.DB));
  }

  /**
   * `/api/auth/*` → Better Auth. Só chega pelo binding do admin, que sobrescreve
   * `cf-connecting-ip` (rate limit por IP); sem ele a request é recusada.
   */
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== AUTH_BASE_PATH && !pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!request.headers.get("cf-connecting-ip")) {
      return Response.json({ error: "missing_client_ip" }, { status: 400 });
    }
    return this.run("fetch", () => this.deps().auth.handler(request));
  }

  async session(caller: PainelCaller): Promise<SessionCtx | null> {
    return this.run("session", () => this.service().session(caller));
  }

  async switchActiveStore(
    caller: PainelCaller,
    input: SwitchActiveStoreInput,
  ): Promise<RpcResult<ActiveStore>> {
    return this.run("switchActiveStore", () => this.service().switchActiveStore(caller, input));
  }

  async listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>> {
    return this.run("listMembers", () => this.service().listMembers(caller));
  }

  async inviteMember(
    caller: PainelCaller,
    input: InviteMemberInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    return this.run("inviteMember", () => this.service().inviteMember(caller, input));
  }

  async opsInviteOwner(
    caller: PainelCaller,
    input: OpsInviteOwnerInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    return this.run("opsInviteOwner", () => this.service().opsInviteOwner(caller, input));
  }

  async removeMember(caller: PainelCaller, input: RemoveMemberInput): Promise<RpcResult<null>> {
    return this.run("removeMember", () => this.service().removeMember(caller, input));
  }

  async menuGet(caller: PainelCaller): Promise<RpcResult<AdminMenu>> {
    return this.run("menuGet", () => this.menu().menuGet(caller));
  }

  async menuCreateCategory(
    caller: PainelCaller,
    input: MenuCreateCategoryInput,
  ): Promise<RpcResult<{ categoryId: string }>> {
    return this.run("menuCreateCategory", () => this.menu().menuCreateCategory(caller, input));
  }

  async menuUpdateCategory(
    caller: PainelCaller,
    input: MenuUpdateCategoryInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateCategory", () => this.menu().menuUpdateCategory(caller, input));
  }

  async menuDeleteCategory(
    caller: PainelCaller,
    input: MenuDeleteCategoryInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteCategory", () => this.menu().menuDeleteCategory(caller, input));
  }

  async menuReorderCategories(
    caller: PainelCaller,
    input: MenuReorderCategoriesInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderCategories", () =>
      this.menu().menuReorderCategories(caller, input),
    );
  }

  async menuCreateItem(
    caller: PainelCaller,
    input: MenuCreateItemInput,
  ): Promise<RpcResult<{ itemId: string }>> {
    return this.run("menuCreateItem", () => this.menu().menuCreateItem(caller, input));
  }

  async menuUpdateItem(caller: PainelCaller, input: MenuUpdateItemInput): Promise<RpcResult<null>> {
    return this.run("menuUpdateItem", () => this.menu().menuUpdateItem(caller, input));
  }

  async menuDeleteItem(caller: PainelCaller, input: MenuDeleteItemInput): Promise<RpcResult<null>> {
    return this.run("menuDeleteItem", () => this.menu().menuDeleteItem(caller, input));
  }

  async menuReorderItems(
    caller: PainelCaller,
    input: MenuReorderItemsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderItems", () => this.menu().menuReorderItems(caller, input));
  }

  async menuCreateComplementGroup(
    caller: PainelCaller,
    input: MenuCreateComplementGroupInput,
  ): Promise<RpcResult<{ groupId: string }>> {
    return this.run("menuCreateComplementGroup", () =>
      this.menu().menuCreateComplementGroup(caller, input),
    );
  }

  async menuUpdateComplementGroup(
    caller: PainelCaller,
    input: MenuUpdateComplementGroupInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateComplementGroup", () =>
      this.menu().menuUpdateComplementGroup(caller, input),
    );
  }

  async menuDeleteComplementGroup(
    caller: PainelCaller,
    input: MenuDeleteComplementGroupInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteComplementGroup", () =>
      this.menu().menuDeleteComplementGroup(caller, input),
    );
  }

  async menuReorderComplementGroups(
    caller: PainelCaller,
    input: MenuReorderComplementGroupsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderComplementGroups", () =>
      this.menu().menuReorderComplementGroups(caller, input),
    );
  }

  async menuCopyComplementGroups(
    caller: PainelCaller,
    input: MenuCopyComplementGroupsInput,
  ): Promise<RpcResult<{ groupIds: string[] }>> {
    return this.run("menuCopyComplementGroups", () =>
      this.menu().menuCopyComplementGroups(caller, input),
    );
  }

  async menuCreateAdditional(
    caller: PainelCaller,
    input: MenuCreateAdditionalInput,
  ): Promise<RpcResult<{ additionalId: string }>> {
    return this.run("menuCreateAdditional", () => this.menu().menuCreateAdditional(caller, input));
  }

  async menuUpdateAdditional(
    caller: PainelCaller,
    input: MenuUpdateAdditionalInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateAdditional", () => this.menu().menuUpdateAdditional(caller, input));
  }

  async menuDeleteAdditional(
    caller: PainelCaller,
    input: MenuDeleteAdditionalInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteAdditional", () => this.menu().menuDeleteAdditional(caller, input));
  }

  async menuReorderAdditionals(
    caller: PainelCaller,
    input: MenuReorderAdditionalsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderAdditionals", () =>
      this.menu().menuReorderAdditionals(caller, input),
    );
  }

  async menuUploadImage(
    caller: PainelCaller,
    input: MenuUploadImageInput,
  ): Promise<RpcResult<MenuUploadedImage>> {
    return this.run("menuUploadImage", () => this.menu().menuUploadImage(caller, input));
  }

  async opsListStores(caller: PainelCaller): Promise<RpcResult<OpsStoreListItem[]>> {
    return this.run("opsListStores", () => this.ops().opsListStores(caller));
  }

  async opsGetStore(
    caller: PainelCaller,
    input: OpsStoreRefInput,
  ): Promise<RpcResult<OpsStoreDetail>> {
    return this.run("opsGetStore", () => this.ops().opsGetStore(caller, input));
  }

  async opsCreateStore(
    caller: PainelCaller,
    input: OpsCreateStoreInput,
  ): Promise<RpcResult<{ storeId: string }>> {
    return this.run("opsCreateStore", () => this.ops().opsCreateStore(caller, input));
  }

  async opsUpdateStore(caller: PainelCaller, input: OpsUpdateStoreInput): Promise<RpcResult<null>> {
    return this.run("opsUpdateStore", () => this.ops().opsUpdateStore(caller, input));
  }

  async opsActivateStore(
    caller: PainelCaller,
    input: OpsActivateStoreInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsActivateStore", () => this.ops().opsActivateStore(caller, input));
  }

  async opsSuspendStore(
    caller: PainelCaller,
    input: OpsSuspendStoreInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsSuspendStore", () => this.ops().opsSuspendStore(caller, input));
  }

  async opsSetCardMode(caller: PainelCaller, input: OpsSetCardModeInput): Promise<RpcResult<null>> {
    return this.run("opsSetCardMode", () => this.ops().opsSetCardMode(caller, input));
  }

  async opsSetStorePlan(
    caller: PainelCaller,
    input: OpsSetStorePlanInput,
  ): Promise<RpcResult<{ planId: string }>> {
    return this.run("opsSetStorePlan", () => this.ops().opsSetStorePlan(caller, input));
  }

  async opsListPlanTiers(caller: PainelCaller): Promise<RpcResult<PlanTierTableView[]>> {
    return this.run("opsListPlanTiers", () => this.ops().opsListPlanTiers(caller));
  }

  async opsPublishPlanTiers(
    caller: PainelCaller,
    input: OpsPublishPlanTiersInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsPublishPlanTiers", () => this.ops().opsPublishPlanTiers(caller, input));
  }

  async opsListPaymentFees(
    caller: PainelCaller,
    input: OpsListPaymentFeesInput,
  ): Promise<RpcResult<PaymentFeeView[]>> {
    return this.run("opsListPaymentFees", () => this.ops().opsListPaymentFees(caller, input));
  }

  async opsCreatePaymentFees(
    caller: PainelCaller,
    input: OpsCreatePaymentFeesInput,
  ): Promise<RpcResult<{ feeIds: string[] }>> {
    return this.run("opsCreatePaymentFees", () => this.ops().opsCreatePaymentFees(caller, input));
  }

  async opsEndPaymentFee(
    caller: PainelCaller,
    input: OpsEndPaymentFeeInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsEndPaymentFee", () => this.ops().opsEndPaymentFee(caller, input));
  }

  async opsListProviderCosts(caller: PainelCaller): Promise<RpcResult<ProviderCostView[]>> {
    return this.run("opsListProviderCosts", () => this.ops().opsListProviderCosts(caller));
  }

  async opsCreateProviderCost(
    caller: PainelCaller,
    input: OpsCreateProviderCostInput,
  ): Promise<RpcResult<{ costId: string }>> {
    return this.run("opsCreateProviderCost", () => this.ops().opsCreateProviderCost(caller, input));
  }

  async opsEndProviderCost(
    caller: PainelCaller,
    input: OpsEndProviderCostInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsEndProviderCost", () => this.ops().opsEndProviderCost(caller, input));
  }

  async opsListStoreAudit(
    caller: PainelCaller,
    input: OpsStoreRefInput,
  ): Promise<RpcResult<OpsAuditEntry[]>> {
    return this.run("opsListStoreAudit", () => this.ops().opsListStoreAudit(caller, input));
  }

  async ordersList(caller: PainelCaller, input?: OrdersListInput): Promise<RpcResult<OrdersList>> {
    return this.run("ordersList", () => this.orders().ordersList(caller, input));
  }

  async ordersGet(caller: PainelCaller, input: OrderRefInput): Promise<RpcResult<OrderDetail>> {
    return this.run("ordersGet", () => this.orders().ordersGet(caller, input));
  }

  async ordersTransition(
    caller: PainelCaller,
    input: OrderTransitionInput,
  ): Promise<RpcResult<OrderTransitionResult>> {
    return this.run("ordersTransition", () => this.orders().ordersTransition(caller, input));
  }

  async ordersCancel(
    caller: PainelCaller,
    input: OrderCancelInput,
  ): Promise<RpcResult<OrderTransitionResult>> {
    return this.run("ordersCancel", () => this.orders().ordersCancel(caller, input));
  }

  async storeOperationGet(caller: PainelCaller): Promise<RpcResult<StoreOperationSettings>> {
    return this.run("storeOperationGet", () => this.orders().storeOperationGet(caller));
  }

  async storeSetPause(
    caller: PainelCaller,
    input: StoreSetPauseInput,
  ): Promise<RpcResult<PauseState>> {
    return this.run("storeSetPause", () => this.orders().storeSetPause(caller, input));
  }

  async storeSetHours(caller: PainelCaller, input: StoreSetHoursInput): Promise<RpcResult<null>> {
    return this.run("storeSetHours", () => this.orders().storeSetHours(caller, input));
  }

  async storeSetFulfillment(
    caller: PainelCaller,
    input: StoreSetFulfillmentInput,
  ): Promise<RpcResult<null>> {
    return this.run("storeSetFulfillment", () => this.orders().storeSetFulfillment(caller, input));
  }

  async storeSetCardBrands(
    caller: PainelCaller,
    input: StoreSetCardBrandsInput,
  ): Promise<RpcResult<null>> {
    return this.run("storeSetCardBrands", () => this.orders().storeSetCardBrands(caller, input));
  }

  async storeSetPrintOnAccept(
    caller: PainelCaller,
    input: StoreSetPrintOnAcceptInput,
  ): Promise<RpcResult<null>> {
    return this.run("storeSetPrintOnAccept", () =>
      this.orders().storeSetPrintOnAccept(caller, input),
    );
  }

  async storeSetDeliveryRate(
    caller: PainelCaller,
    input: StoreSetDeliveryRateInput,
  ): Promise<RpcResult<null>> {
    return this.run("storeSetDeliveryRate", () =>
      this.orders().storeSetDeliveryRate(caller, input),
    );
  }

  async onboardingGet(caller: PainelCaller): Promise<RpcResult<OwnerOnboardingState>> {
    return this.run("onboardingGet", () => this.onboarding().onboardingGet(caller));
  }

  async onboardingAnswerProfile(
    caller: PainelCaller,
    input: OwnerProfileInput,
  ): Promise<RpcResult<null>> {
    return this.run("onboardingAnswerProfile", () =>
      this.onboarding().onboardingAnswerProfile(caller, input),
    );
  }

  async onboardingAcknowledgeReady(caller: PainelCaller): Promise<RpcResult<null>> {
    return this.run("onboardingAcknowledgeReady", () =>
      this.onboarding().onboardingAcknowledgeReady(caller),
    );
  }

  async storeSettingsGet(caller: PainelCaller): Promise<RpcResult<OwnerStoreSettings>> {
    return this.run("storeSettingsGet", () => this.onboarding().storeSettingsGet(caller));
  }

  async storeCheckSlug(
    caller: PainelCaller,
    input: StoreSlugInput,
  ): Promise<RpcResult<SlugAvailability>> {
    return this.run("storeCheckSlug", () => this.onboarding().storeCheckSlug(caller, input));
  }

  async storeSetSlug(
    caller: PainelCaller,
    input: StoreSlugInput,
  ): Promise<RpcResult<{ slug: string; storeUrl: string }>> {
    return this.run("storeSetSlug", () => this.onboarding().storeSetSlug(caller, input));
  }

  async storeSetContact(caller: PainelCaller, input: StoreContactInput): Promise<RpcResult<null>> {
    return this.run("storeSetContact", () => this.onboarding().storeSetContact(caller, input));
  }

  async storeSetPixels(caller: PainelCaller, input: StorePixelsInput): Promise<RpcResult<null>> {
    return this.run("storeSetPixels", () => this.onboarding().storeSetPixels(caller, input));
  }

  async storeSetShowcase(
    caller: PainelCaller,
    input: StoreShowcaseInput,
  ): Promise<RpcResult<null>> {
    return this.run("storeSetShowcase", () => this.onboarding().storeSetShowcase(caller, input));
  }

  async storeUploadBrandImage(
    caller: PainelCaller,
    input: StoreUploadBrandImageInput,
  ): Promise<RpcResult<StoreUploadedBrandImage>> {
    return this.run("storeUploadBrandImage", () =>
      this.onboarding().storeUploadBrandImage(caller, input),
    );
  }

  async funnelReport(
    caller: PainelCaller,
    input: FunnelReportInput,
  ): Promise<RpcResult<FunnelReport>> {
    return this.run("funnelReport", () => this.onboarding().funnelReport(caller, input));
  }

  async couponsGet(caller: PainelCaller): Promise<RpcResult<CouponsOverview>> {
    return this.run("couponsGet", () => this.coupons().couponsGet(caller));
  }

  async couponCreate(
    caller: PainelCaller,
    input: CouponCreateInput,
  ): Promise<RpcResult<{ couponId: string }>> {
    return this.run("couponCreate", () => this.coupons().couponCreate(caller, input));
  }

  async couponUpdate(caller: PainelCaller, input: CouponUpdateInput): Promise<RpcResult<null>> {
    return this.run("couponUpdate", () => this.coupons().couponUpdate(caller, input));
  }

  async couponSetActive(
    caller: PainelCaller,
    input: CouponSetActiveInput,
  ): Promise<RpcResult<null>> {
    return this.run("couponSetActive", () => this.coupons().couponSetActive(caller, input));
  }

  async couponDelete(caller: PainelCaller, input: CouponRefInput): Promise<RpcResult<null>> {
    return this.run("couponDelete", () => this.coupons().couponDelete(caller, input));
  }

  async welcomeCouponSet(
    caller: PainelCaller,
    input: WelcomeCouponInput,
  ): Promise<RpcResult<null>> {
    return this.run("welcomeCouponSet", () => this.coupons().welcomeCouponSet(caller, input));
  }

  async opsCustomerFind(
    caller: PainelCaller,
    input: OpsCustomerFindInput,
  ): Promise<RpcResult<OpsCustomerView>> {
    return this.run("opsCustomerFind", () => this.opsCustomers().opsCustomerFind(caller, input));
  }

  async opsCustomerChangePhone(
    caller: PainelCaller,
    input: OpsCustomerChangePhoneInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsCustomerChangePhone", () =>
      this.opsCustomers().opsCustomerChangePhone(caller, input),
    );
  }

  async opsListLeads(
    caller: PainelCaller,
    input: OpsListLeadsInput,
  ): Promise<RpcResult<LeadView[]>> {
    return this.run("opsListLeads", () => this.ops().opsListLeads(caller, input));
  }

  async opsSetLeadStatus(
    caller: PainelCaller,
    input: OpsSetLeadStatusInput,
  ): Promise<RpcResult<null>> {
    return this.run("opsSetLeadStatus", () => this.ops().opsSetLeadStatus(caller, input));
  }
}
