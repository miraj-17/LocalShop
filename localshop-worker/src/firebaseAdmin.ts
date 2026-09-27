import { importPKCS8, SignJWT } from "jose";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

async function getServiceAccount(env: Env): Promise<FirebaseServiceAccount> {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing");
  }

  return JSON.parse(raw) as FirebaseServiceAccount;
}

export async function getFirebaseAccessToken(
  env: Env
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const serviceAccount = await getServiceAccount(env);

  const privateKey = await importPKCS8(
    serviceAccount.private_key,
    "RS256"
  );

  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore",
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
    })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google OAuth token request failed: ${errorText}`
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Google OAuth response did not contain access_token");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt:
      Date.now() +
      Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  };

  return data.access_token;
}