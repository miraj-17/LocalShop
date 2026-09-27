
import { getFirebaseAccessToken } from "./firebaseAdmin";

const PROJECT_ID = "localshop-5e90d";
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function firestoreGet(
  env: Env,
  path: string
): Promise<unknown> {
  const token = await getFirebaseAccessToken(env);

  const response = await fetch(
    `${FIRESTORE_BASE}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Firestore GET failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

export async function firestoreCreate(
  env: Env,
  collection: string,
  documentId: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  const token = await getFirebaseAccessToken(env);

  const response = await fetch(
    `${FIRESTORE_BASE}/${collection}?documentId=${encodeURIComponent(documentId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(fields),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Firestore CREATE failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

function toFirestoreValue(
  value: unknown
): Record<string, unknown> {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue),
      },
    };
  }

  throw new Error("Unsupported Firestore value");
}

function toFirestoreFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = toFirestoreValue(value);
  }

  return result;
}

export async function firestorePatch(
  env: Env,
  path: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  const token = await getFirebaseAccessToken(env);

  const fieldPaths = Object.keys(fields)
    .map(
      (key) =>
        `updateMask.fieldPaths=${encodeURIComponent(key)}`
    )
    .join("&");

  const response = await fetch(
    `${FIRESTORE_BASE}/${path}?${fieldPaths}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(fields),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Firestore PATCH failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

