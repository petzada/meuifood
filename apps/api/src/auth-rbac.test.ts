import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAdministrativeDatabase,
  createBusinessDatabase,
  type BusinessDatabase,
} from "@foode/db";

import { buildApp } from "./app.js";
import { createSupabaseAccessTokenVerifier } from "./auth.js";

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

function requiredSecret(source: string, name: string) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`${name} não foi configurada para o teste remoto.`);

  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  if (!unquoted) throw new Error(`${name} está vazia.`);
  return unquoted;
}

async function productionDatabaseUrls() {
  const environmentPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  const environmentPooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (Boolean(environmentPassword) !== Boolean(environmentPooler)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL devem ser configuradas juntas.",
    );
  }

  let password = environmentPassword;
  let pooler = environmentPooler;
  if (!password || !pooler) {
    const repositoryEnvironmentFile = new URL("../../../.env", import.meta.url);
    const linkedPoolerFile = new URL(
      "../../../supabase/.temp/pooler-url",
      import.meta.url,
    );
    if (
      !existsSync(repositoryEnvironmentFile) ||
      !existsSync(linkedPoolerFile)
    ) {
      throw new Error(
        "Configure as credenciais do Supabase de produção para a prova remota.",
      );
    }

    const [environmentFile, poolerFile] = await Promise.all([
      readFile(repositoryEnvironmentFile, "utf8"),
      readFile(linkedPoolerFile, "utf8"),
    ]);
    password = requiredSecret(environmentFile, "SUPABASE_DB_PASSWORD");
    pooler = poolerFile.trim();
  }

  const url = new URL(pooler);
  url.password = password;
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  const businessUrlValue = process.env.BUSINESS_DATABASE_URL?.trim();
  if (!businessUrlValue) {
    throw new Error(
      "BUSINESS_DATABASE_URL é obrigatória para provar o login restrito real.",
    );
  }
  const businessUrl = new URL(businessUrlValue);
  if (
    businessUrl.hostname !== url.hostname ||
    !businessUrl.username.startsWith("foode_business")
  ) {
    throw new Error(
      "BUSINESS_DATABASE_URL deve usar foode_business no pooler do Foode Delivery.",
    );
  }
  businessUrl.searchParams.set("sslmode", "require");
  businessUrl.searchParams.set("uselibpqcompat", "true");
  return { administrativeUrl: url.toString(), businessUrl: businessUrl.toString() };
}

describe("autenticação e RBAC de Dono e Operador", { timeout: 15_000 }, () => {
  const runId = randomUUID();
  const createdStoreIds: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let crossStoreOperatorMembershipId: string;
  let invalidPrivateKey: SigningKey;
  const invitedEmails: string[] = [];
  let issuer: string;
  let jwksServer: Server;
  let operatorUserId: string;
  let ownerBUserId: string;
  let ownerUserId: string;
  let ownerMembershipId: string;
  let privateKey: SigningKey;
  const revokedInvitedUserIds: string[] = [];
  let removableOperatorMembershipId: string;
  let removableOperatorUserId: string;
  let storeBId: string;
  let storeId: string;
  let unsafeBusinessDatabase: BusinessDatabase;
  let verifyAccessToken: ReturnType<typeof createSupabaseAccessTokenVerifier>;

  beforeAll(async () => {
    const signingKeys = await generateKeyPair("ES256");
    privateKey = signingKeys.privateKey;
    invalidPrivateKey = (await generateKeyPair("ES256")).privateKey;
    const publicJwk = await exportJWK(signingKeys.publicKey);
    Object.assign(publicJwk, { alg: "ES256", kid: "fixture-key", use: "sig" });
    jwksServer = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const address = jwksServer.address();
    if (!address || typeof address === "string") {
      throw new Error("O JWKS controlado não iniciou.");
    }
    issuer = "https://fixture.supabase.co/auth/v1";
    verifyAccessToken = createSupabaseAccessTokenVerifier({
      audience: "authenticated",
      issuer,
      jwksUrl: new URL(
        `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
      ),
    });

    const { administrativeUrl, businessUrl } = await productionDatabaseUrls();
    administrativeDatabase = createAdministrativeDatabase(administrativeUrl);
    businessDatabase = createBusinessDatabase(businessUrl);
    unsafeBusinessDatabase = createBusinessDatabase(administrativeUrl);
    await businessDatabase.assertRestrictedRuntime();

    const store = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        name: `Fixture RBAC ${runId}`,
        slug: `fixture-rbac-${runId}`,
        taxId: [...randomBytes(14)].map((byte) => String(byte % 10)).join(""),
      },
    });
    createdStoreIds.push(store.id);
    storeId = store.id;
    ownerUserId = randomUUID();
    const ownerMembership = await administrativeDatabase.storeMember.create({
      data: { role: "owner", storeId, userId: ownerUserId },
    });
    ownerMembershipId = ownerMembership.id;
    operatorUserId = randomUUID();
    await administrativeDatabase.storeMember.create({
      data: { role: "operator", storeId, userId: operatorUserId },
    });
    removableOperatorUserId = randomUUID();
    const removableOperatorMembership =
      await administrativeDatabase.storeMember.create({
        data: { role: "operator", storeId, userId: removableOperatorUserId },
      });
    removableOperatorMembershipId = removableOperatorMembership.id;

    const storeB = await administrativeDatabase.store.create({
      data: {
        billingMode: "merchant_own_account",
        name: `Fixture RBAC B ${runId}`,
        slug: `fixture-rbac-b-${runId}`,
        taxId: [...randomBytes(14)].map((byte) => String(byte % 10)).join(""),
      },
    });
    createdStoreIds.push(storeB.id);
    storeBId = storeB.id;
    ownerBUserId = randomUUID();
    await administrativeDatabase.storeMember.create({
      data: { role: "owner", storeId: storeBId, userId: ownerBUserId },
    });
    const crossStoreOperator = await administrativeDatabase.storeMember.create({
      data: { role: "operator", storeId: storeBId, userId: randomUUID() },
    });
    crossStoreOperatorMembershipId = crossStoreOperator.id;
  }, 60_000);

  afterAll(async () => {
    try {
      if (administrativeDatabase && createdStoreIds.length > 0) {
        await administrativeDatabase.store.deleteMany({
          where: { id: { in: createdStoreIds } },
        });
        const residueCount = await administrativeDatabase.store.count({
          where: { id: { in: createdStoreIds } },
        });
        expect(residueCount).toBe(0);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        jwksServer?.close((error) => (error ? reject(error) : resolve())),
      );
      await businessDatabase?.close();
      await unsafeBusinessDatabase?.close();
      await administrativeDatabase?.$disconnect();
    }
  });

  async function accessToken(
    overrides: {
      audience?: string;
      expiresAt?: string;
      issuer?: string;
      key?: SigningKey;
      subject?: string;
    } = {},
  ) {
    return await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "fixture-key" })
      .setSubject(overrides.subject ?? randomUUID())
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(overrides.expiresAt ?? "5m")
      .sign(overrides.key ?? privateKey);
  }

  function invitationService(invitedUserId: string = randomUUID()) {
    return {
      async inviteOperator(email: string) {
        invitedEmails.push(email);
        return { userId: invitedUserId };
      },
      async revokeInvitedUser(userId: string) {
        revokedInvitedUserIds.push(userId);
      },
    };
  }

  it("rejeita request sem token antes de resolver a membership", async () => {
    const app = buildApp({
      businessDatabase,
      logger: false,
      verifyAccessToken: async () => {
        throw new Error("o verificador não deveria ser chamado sem Bearer");
      },
    });

    try {
      const response = await app.inject({ method: "GET", url: "/staff/context" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("rejeita startup com credencial administrativa mesmo rebaixando a role", async () => {
    await expect(unsafeBusinessDatabase.assertRestrictedRuntime()).rejects.toThrow(
      "business_database_role_is_not_restricted",
    );
  });

  it.each([
    ["assinatura", () => accessToken({ key: invalidPrivateKey })],
    ["expiração", () => accessToken({ expiresAt: "-1s" })],
    ["issuer", () => accessToken({ issuer: "https://outra-origem.example" })],
    ["audience", () => accessToken({ audience: "outro-publico" })],
  ])("rejeita token com %s inválida", async (_scenario, tokenFactory) => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const response = await app.inject({
        headers: { authorization: `Bearer ${await tokenFactory()}` },
        method: "GET",
        url: "/staff/context",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("rejeita token válido sem membership persistida", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const response = await app.inject({
        headers: { authorization: `Bearer ${await accessToken()}` },
        method: "GET",
        url: "/staff/context",
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "membership_required" });
    } finally {
      await app.close();
    }
  });

  it("deriva Loja e papel da membership persistida do Dono", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const response = await app.inject({
        headers: {
          authorization: `Bearer ${await accessToken({ subject: ownerUserId })}`,
        },
        method: "GET",
        url: "/staff/context",
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ context: { role: "owner", storeId } });
    } finally {
      await app.close();
    }
  });

  it("nega configuração ao Operador sem efeito persistido", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const operatorToken = await accessToken({ subject: operatorUserId });
      const ownerToken = await accessToken({ subject: ownerUserId });
      const deniedResponse = await app.inject({
        headers: { authorization: `Bearer ${operatorToken}` },
        method: "PATCH",
        payload: { name: `Alteração proibida ${runId}` },
        url: `/stores/${storeId}`,
      });
      const persistedResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "GET",
        url: `/stores/${storeId}`,
      });

      expect(deniedResponse.statusCode).toBe(403);
      expect(deniedResponse.json()).toEqual({ error: "forbidden" });
      expect(persistedResponse.statusCode, persistedResponse.body).toBe(200);
      expect(persistedResponse.json()).toMatchObject({
        store: { id: storeId, name: `Fixture RBAC ${runId}` },
      });
    } finally {
      await app.close();
    }
  });

  it("nega a área de equipe ao Operador", async () => {
    const invitationCount = invitedEmails.length;
    const app = buildApp({
      businessDatabase,
      logger: false,
      staffInvitationService: invitationService(),
      verifyAccessToken,
    });

    try {
      const operatorToken = await accessToken({ subject: operatorUserId });
      const response = await app.inject({
        headers: { authorization: `Bearer ${operatorToken}` },
        method: "GET",
        url: "/staff/members",
      });
      const invitationResponse = await app.inject({
        headers: { authorization: `Bearer ${operatorToken}` },
        method: "POST",
        payload: { email: `negado-${runId}@example.invalid` },
        url: "/staff/operators/invitations",
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "forbidden" });
      expect(invitationResponse.statusCode).toBe(403);
      expect(invitedEmails).toHaveLength(invitationCount);
    } finally {
      await app.close();
    }
  });

  it("revoga o convite se a membership não puder ser persistida", async () => {
    const app = buildApp({
      businessDatabase,
      logger: false,
      staffInvitationService: invitationService(ownerUserId),
      verifyAccessToken,
    });

    try {
      const ownerToken = await accessToken({ subject: ownerUserId });
      const response = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "POST",
        payload: { email: `duplicado-${runId}@example.invalid` },
        url: "/staff/operators/invitations",
      });

      expect(response.statusCode).toBe(500);
      expect(revokedInvitedUserIds).toContain(ownerUserId);
    } finally {
      await app.close();
    }
  });

  it("não lê nem altera configuração de outra Loja", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const ownerAToken = await accessToken({ subject: ownerUserId });
      const ownerBToken = await accessToken({ subject: ownerBUserId });
      const readResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerAToken}` },
        method: "GET",
        url: `/stores/${storeBId}`,
      });
      const writeResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerAToken}` },
        method: "PATCH",
        payload: { name: `Cross Loja proibido ${runId}` },
        url: `/stores/${storeBId}`,
      });
      const persistedResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerBToken}` },
        method: "GET",
        url: `/stores/${storeBId}`,
      });

      expect(readResponse.statusCode).toBe(404);
      expect(writeResponse.statusCode).toBe(404);
      expect(persistedResponse.statusCode, persistedResponse.body).toBe(200);
      expect(persistedResponse.json()).toMatchObject({
        store: { name: `Fixture RBAC B ${runId}` },
      });
    } finally {
      await app.close();
    }
  });

  it("permite ao Dono listar membros e convidar Operador", async () => {
    const invitedUserId = randomUUID();
    const app = buildApp({
      businessDatabase,
      logger: false,
      staffInvitationService: invitationService(invitedUserId),
      verifyAccessToken,
    });

    try {
      const ownerToken = await accessToken({ subject: ownerUserId });
      const invitationResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "POST",
        payload: { email: `operador-${runId}@example.invalid` },
        url: "/staff/operators/invitations",
      });
      const membersResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "GET",
        url: "/staff/members",
      });

      expect(invitationResponse.statusCode, invitationResponse.body).toBe(201);
      expect(invitationResponse.json()).toMatchObject({
        member: { role: "operator", userId: invitedUserId },
      });
      expect(invitedEmails).toContain(`operador-${runId}@example.invalid`);
      expect(membersResponse.statusCode, membersResponse.body).toBe(200);
      expect(membersResponse.json().members).toEqual(
        expect.arrayContaining([
          { id: ownerMembershipId, role: "owner", userId: ownerUserId },
          expect.objectContaining({ role: "operator", userId: invitedUserId }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("não remove membership de outra Loja", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const ownerAToken = await accessToken({ subject: ownerUserId });
      const ownerBToken = await accessToken({ subject: ownerBUserId });
      const deniedResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerAToken}` },
        method: "DELETE",
        url: `/staff/members/${crossStoreOperatorMembershipId}`,
      });
      const ownerBContext = await app.inject({
        headers: { authorization: `Bearer ${ownerBToken}` },
        method: "GET",
        url: "/staff/context",
      });

      expect(deniedResponse.statusCode).toBe(404);
      expect(ownerBContext.statusCode, ownerBContext.body).toBe(200);
      expect(ownerBContext.json()).toEqual({
        context: { role: "owner", storeId: storeBId },
      });
    } finally {
      await app.close();
    }
  });

  it("remover Operador invalida o token já emitido no request seguinte", async () => {
    const app = buildApp({ businessDatabase, logger: false, verifyAccessToken });

    try {
      const ownerToken = await accessToken({ subject: ownerUserId });
      const operatorToken = await accessToken({ subject: removableOperatorUserId });
      const removalResponse = await app.inject({
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "DELETE",
        url: `/staff/members/${removableOperatorMembershipId}`,
      });
      const nextRequest = await app.inject({
        headers: { authorization: `Bearer ${operatorToken}` },
        method: "GET",
        url: "/staff/context",
      });

      expect(removalResponse.statusCode, removalResponse.body).toBe(204);
      expect(nextRequest.statusCode).toBe(403);
      expect(nextRequest.json()).toEqual({ error: "membership_required" });
    } finally {
      await app.close();
    }
  });
});
