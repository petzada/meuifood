import { describe, expect, it } from "vitest";

import { recalculateGuestPickupOrder } from "./order-recalculate.js";

const burgerId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const optionId = "33333333-3333-4333-8333-333333333333";
const additionalId = "44444444-4444-4444-8444-444444444444";

function catalog() {
  return new Map([
    [
      burgerId,
      {
        available: true,
        additionals: [
          {
            available: true,
            id: additionalId,
            name: "Bacon",
            priceCents: 300,
          },
        ],
        complementGroups: [
          {
            id: groupId,
            name: "Ponto",
            options: [{ id: optionId, name: "Ao ponto" }],
            required: true,
          },
        ],
        id: burgerId,
        name: "Burger",
        priceCents: 2500,
      },
    ],
  ]);
}

describe("recalculateGuestPickupOrder", () => {
  it("recalcula total em centavos a partir das referências", () => {
    const result = recalculateGuestPickupOrder(catalog(), [
      {
        additionalIds: [additionalId],
        complementSelections: { [groupId]: optionId },
        itemId: burgerId,
        quantity: 2,
      },
    ]);
    expect(result).toEqual({
      itemsTotalCents: 5600,
      lines: [
        {
          additionalSnapshots: [
            { id: additionalId, name: "Bacon", priceCents: 300 },
          ],
          complementSnapshots: [
            {
              groupId,
              groupName: "Ponto",
              optionId,
              optionName: "Ao ponto",
            },
          ],
          itemName: "Burger",
          lineTotalCents: 5600,
          menuItemId: burgerId,
          quantity: 2,
          unitPriceCents: 2800,
        },
      ],
      ok: true,
    });
  });

  it("rejeita item indisponível e carrinho vazio", () => {
    const items = catalog();
    const item = items.get(burgerId)!;
    item.available = false;
    expect(
      recalculateGuestPickupOrder(items, [
        {
          additionalIds: [],
          complementSelections: { [groupId]: optionId },
          itemId: burgerId,
          quantity: 1,
        },
      ]).ok,
    ).toBe(false);
    expect(recalculateGuestPickupOrder(catalog(), []).ok).toBe(false);
  });
});
