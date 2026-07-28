import type { FastifyInstance } from "fastify";

function assertStatus(
  label: string,
  response: { body: string; statusCode: number },
  expected: number,
) {
  if (response.statusCode !== expected) {
    throw new Error(
      `${label}: esperado HTTP ${expected}, recebido ${response.statusCode} ${response.body}`,
    );
  }
}

export async function proveStoreOperationPreflight({
  app,
  setCurrentTime,
  storeASlug,
}: {
  app: FastifyInstance;
  setCurrentTime: (value: string) => void;
  storeASlug: string;
}) {
  const operatorRead = await app.inject({
    headers: { authorization: "Bearer operator-a" },
    method: "GET",
    url: "/operation",
  });
  assertStatus("Operador não vê horários ou Pausa", operatorRead, 403);
  const operatorWrite = await app.inject({
    headers: { authorization: "Bearer operator-a" },
    method: "PUT",
    payload: { paused: true },
    url: "/operation/pause",
  });
  assertStatus("Operador não altera a Pausa", operatorWrite, 403);
  const operatorHoursWrite = await app.inject({
    headers: { authorization: "Bearer operator-a" },
    method: "PUT",
    payload: {
      periods: [{ weekday: 1, opensAt: "08:00", closesAt: "09:00" }],
    },
    url: "/operation/hours",
  });
  assertStatus("Operador não altera horários", operatorHoursWrite, 403);
  const afterOperatorAttempts = await app.inject({
    headers: { authorization: "Bearer owner-a" },
    method: "GET",
    url: "/operation",
  });
  assertStatus(
    "negações do Operador preservam a configuração",
    afterOperatorAttempts,
    200,
  );
  if (
    afterOperatorAttempts.json().operation.paused !== false ||
    afterOperatorAttempts.json().operation.periods.length !== 0
  ) {
    throw new Error("Tentativa do Operador alterou a configuração.");
  }

  const expectedPeriods = [
    { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
    { weekday: 1, opensAt: "18:00", closesAt: "22:00" },
  ];
  const saveHours = await app.inject({
    headers: { authorization: "Bearer owner-a" },
    method: "PUT",
    payload: { periods: expectedPeriods },
    url: "/operation/hours",
  });
  assertStatus("Dono salva horários válidos", saveHours, 200);

  for (const periods of [
    [
      { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
      { weekday: 1, opensAt: "13:59", closesAt: "18:00" },
    ],
    [{ weekday: 1, opensAt: "18:00", closesAt: "02:00" }],
  ]) {
    const invalid = await app.inject({
      headers: { authorization: "Bearer owner-a" },
      method: "PUT",
      payload: { periods },
      url: "/operation/hours",
    });
    assertStatus("período inválido é rejeitado atomicamente", invalid, 400);
  }

  const ownOperation = await app.inject({
    headers: { authorization: "Bearer owner-a" },
    method: "GET",
    url: "/operation",
  });
  assertStatus("horários válidos permanecem após rejeições", ownOperation, 200);
  if (
    JSON.stringify(ownOperation.json().operation.periods) !==
    JSON.stringify(expectedPeriods)
  ) {
    throw new Error("Rejeição temporal deixou persistência parcial.");
  }

  const otherStoreOperation = await app.inject({
    headers: { authorization: "Bearer owner-b" },
    method: "GET",
    url: "/operation",
  });
  assertStatus(
    "segunda Loja lê somente a própria configuração",
    otherStoreOperation,
    200,
  );
  if (
    otherStoreOperation.json().operation.paused !== false ||
    otherStoreOperation.json().operation.periods.length !== 0
  ) {
    throw new Error("Configuração de funcionamento atravessou Loja.");
  }

  const publicOpen = await app.inject({
    method: "GET",
    url: `/public/stores/${storeASlug}/menu`,
  });
  assertStatus("Storefront aberto mantém Cardápio", publicOpen, 200);
  if (
    publicOpen.json().storefront.operation.state !== "open" ||
    publicOpen.json().storefront.categories[0]?.items[0]?.name !==
      "Item visível"
  ) {
    throw new Error("Projeção pública aberta está incorreta.");
  }

  const pause = await app.inject({
    headers: { authorization: "Bearer owner-a" },
    method: "PUT",
    payload: { paused: true },
    url: "/operation/pause",
  });
  assertStatus("Dono ativa Pausa imediatamente", pause, 200);
  const publicPaused = await app.inject({
    method: "GET",
    url: `/public/stores/${storeASlug}/menu`,
  });
  assertStatus("Storefront em Pausa mantém Cardápio", publicPaused, 200);
  if (
    publicPaused.json().storefront.operation.state !== "paused" ||
    publicPaused.json().storefront.operation.checkout.blockReason !==
      "paused" ||
    JSON.stringify(pause.json().operation.periods) !==
      JSON.stringify(expectedPeriods)
  ) {
    throw new Error("Pausa alterou horários ou projeção pública.");
  }

  const unpause = await app.inject({
    headers: { authorization: "Bearer owner-a" },
    method: "PUT",
    payload: { paused: false },
    url: "/operation/pause",
  });
  assertStatus("Dono desativa Pausa", unpause, 200);
  setCurrentTime("2026-07-27T18:00:00Z");
  const publicOutsideHours = await app.inject({
    method: "GET",
    url: `/public/stores/${storeASlug}/menu`,
  });
  assertStatus(
    "Storefront fora do horário mantém Cardápio",
    publicOutsideHours,
    200,
  );
  const outsideOperation = publicOutsideHours.json().storefront.operation;
  if (
    outsideOperation.state !== "outside_hours" ||
    outsideOperation.checkout.blockReason !== "outside_hours" ||
    outsideOperation.nextOpeningAt !== "2026-07-27T21:00:00Z"
  ) {
    throw new Error("Próxima abertura pública está incorreta.");
  }
}
