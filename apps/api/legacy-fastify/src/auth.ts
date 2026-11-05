import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const userIdSchema = z.uuid();

type SupabaseAccessTokenVerifierOptions = {
  audience: string;
  issuer: string;
  jwksUrl: URL;
};

export function createSupabaseAccessTokenVerifier(
  options: SupabaseAccessTokenVerifierOptions,
) {
  const jwks = createRemoteJWKSet(options.jwksUrl);

  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      audience: options.audience,
      issuer: options.issuer,
    });
    const userId = userIdSchema.parse(payload.sub);
    return { userId };
  };
}

export function supabaseAuthConfiguration(supabaseUrl: string) {
  const baseUrl = new URL(supabaseUrl);
  const issuer = new URL("/auth/v1", baseUrl).toString().replace(/\/$/u, "");
  return {
    audience: "authenticated",
    issuer,
    jwksUrl: new URL("/auth/v1/.well-known/jwks.json", baseUrl),
  };
}
