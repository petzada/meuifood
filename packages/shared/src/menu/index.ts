// `@foode/shared/menu`: contrato público do Cardápio, carrinho puro, navegação do Storefront e
// contrato do Painel (Ticket 23).
export {
  MAX_ADDITIONALS_PER_ITEM,
  MAX_COMPLEMENT_OPTIONS,
  MAX_FEATURED_ITEMS,
  additionalSchema,
  complementGroupSchema,
  complementOptionSchema,
  indexMenuItems,
  menuCategorySchema,
  menuDescriptionSchema,
  menuIdSchema,
  menuItemSchema,
  menuNameSchema,
  publicMenuSchema,
  selectionBoundsFromRequired,
  storeSlugSchema,
  type Additional,
  type ComplementGroup,
  type ComplementOption,
  type MenuCategory,
  type MenuItem,
  type PublicMenu,
} from "./schema.js";

export {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  addCartLine,
  assertSingleStore,
  cartLineErrorMessagePt,
  cartLineSchema,
  cartQuoteRequestSchema,
  cartQuoteResponseSchema,
  cartSchema,
  cartSubtotalCents,
  createEmptyCart,
  lineSubtotalCents,
  lineUnitCents,
  sameLineChoices,
  setCartLineQuantity,
  validateCartLine,
  type Cart,
  type CartLine,
  type CartLineError,
  type CartLineErrorCode,
  type CartLineValidation,
  type CartQuoteRequest,
  type CartSubtotal,
} from "./cart.js";

export {
  MENU_ITEM_SHARE_PARAM,
  MENU_SEARCH_MIN_LENGTH,
  featuredItems,
  menuItemSharePath,
  normalizeSearchText,
  searchMenu,
} from "./browse.js";

export * from "./admin.js";
