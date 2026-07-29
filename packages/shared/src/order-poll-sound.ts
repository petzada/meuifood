/**
 * Polling do Painel (Decisão 23): HTTP a cada 10s.
 * Som toca uma vez por Pedido realmente novo.
 * Carga inicial só estabelece baseline — sem tempestade sonora.
 */

export const ORDER_POLL_INTERVAL_MS = 10_000;

export type PollSoundState = {
  baselineEstablished: boolean;
  seenOrderIds: ReadonlySet<string>;
};

export type PollSoundStep = {
  nextSeenOrderIds: ReadonlySet<string>;
  playForOrderIds: string[];
  baselineEstablished: boolean;
};

export function createEmptyPollSoundState(): PollSoundState {
  return {
    baselineEstablished: false,
    seenOrderIds: new Set(),
  };
}

export function stepOrderPollSound(
  state: PollSoundState,
  currentOrderIds: readonly string[],
): PollSoundStep {
  const current = new Set(currentOrderIds);

  if (!state.baselineEstablished) {
    return {
      baselineEstablished: true,
      nextSeenOrderIds: current,
      playForOrderIds: [],
    };
  }

  const playForOrderIds = currentOrderIds.filter(
    (orderId) => !state.seenOrderIds.has(orderId),
  );

  return {
    baselineEstablished: true,
    nextSeenOrderIds: new Set([...state.seenOrderIds, ...current]),
    playForOrderIds,
  };
}
