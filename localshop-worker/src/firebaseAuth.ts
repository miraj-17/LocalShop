import { jwtVerify, createRemoteJWKSet } from "jose";

const FIREBASE_PROJECT_ID = "localshop-5e90d";

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const JWKS = createRemoteJWKSet(
  new URL(GOOGLE_JWKS_URL)
);

export async function verifyFirebaseToken(
  authorization: string | null
): Promise<{ uid: string; email?: string } | null> {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      !payload.sub
    ) {
      return null;
    }

    return {
      uid: payload.sub,
      email:
        typeof payload.email === "string"
          ? payload.email
          : undefined,
    };
  } catch (error) {
    console.error(
      "Firebase token verification failed:",
      error
    );

    return null;
  }
}