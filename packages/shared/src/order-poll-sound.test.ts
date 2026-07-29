import { describe, expect, it } from "vitest";

import {
  createEmptyPollSoundState,
  stepOrderPollSound,
} from "./order-poll-sound.js";

describe("som da fila por polling", () => {
  it("carga inicial só cria baseline sem tocar som", () => {
    const first = stepOrderPollSound(createEmptyPollSoundState(), [
      "o1",
      "o2",
    ]);
    expect(first.playForOrderIds).toEqual([]);
    expect(first.baselineEstablished).toBe(true);
    expect([...first.nextSeenOrderIds].sort()).toEqual(["o1", "o2"]);
  });

  it("toca exatamente uma vez por Pedido realmente novo", () => {
    const baseline = stepOrderPollSound(createEmptyPollSoundState(), ["o1"]);
    const withNew = stepOrderPollSound(
      {
        baselineEstablished: baseline.baselineEstablished,
        seenOrderIds: baseline.nextSeenOrderIds,
      },
      ["o1", "o2"],
    );
    expect(withNew.playForOrderIds).toEqual(["o2"]);

    const again = stepOrderPollSound(
      {
        baselineEstablished: withNew.baselineEstablished,
        seenOrderIds: withNew.nextSeenOrderIds,
      },
      ["o1", "o2"],
    );
    expect(again.playForOrderIds).toEqual([]);
  });
});
