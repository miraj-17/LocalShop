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
    `${FIRESTORE_BASE}/${collection}?documentId=${encodeURIComponent(
      documentId
    )}`,
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

export async function firestoreCommit(
  env: Env,
  writes: Array<Record<string, unknown>>
): Promise<unknown> {
  const token = await getFirebaseAccessToken(env);

  const response = await fetch(
    `${FIRESTORE_BASE}:commit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        writes,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Firestore COMMIT failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

export function firestoreValue(
  value: unknown
): Record<string, unknown> {
  if (value === null) {
    return {
      nullValue: null,
    };
  }

  if (typeof value === "string") {
    return {
      stringValue: value,
    };
  }

  if (typeof value === "boolean") {
    return {
      booleanValue: value,
    };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? {
          integerValue: String(value),
        }
      : {
          doubleValue: value,
        };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(firestoreValue),
      },
    };
  }

  if (typeof value === "object") {
    const mapFields: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      mapFields[key] = firestoreValue(item);
    }

    return {
      mapValue: {
        fields: mapFields,
      },
    };
  }

  throw new Error(
    `Unsupported Firestore value: ${typeof value}`
  );
}

function toFirestoreFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = firestoreValue(value);
  }

  return result;
}

export function firestoreDocument(
  name: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  return {
    name,
    fields: toFirestoreFields(fields),
  };
}

export function decodeFirestoreValue(
  value: any
): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  if ("referenceValue" in value) {
    return value.referenceValue;
  }

  if ("bytesValue" in value) {
    return value.bytesValue;
  }

  if ("arrayValue" in value) {
    return (
      value.arrayValue?.values?.map(
        decodeFirestoreValue
      ) || []
    );
  }

  if ("mapValue" in value) {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value.mapValue?.fields || {}
    )) {
      result[key] = decodeFirestoreValue(item);
    }

    return result;
  }

  return null;
}

export function documentToObject(
  document: any
): Record<string, unknown> | null {
  if (!document || typeof document !== "object") {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(
    document.fields || {}
  )) {
    result[key] = decodeFirestoreValue(value);
  }

  if (typeof document.name === "string") {
    result._name = document.name;
  }

  if (typeof document.updateTime === "string") {
    result._updateTime = document.updateTime;
  }

  return result;
}