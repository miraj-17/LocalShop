
import { verifyFirebaseToken } from "./firebaseAuth";
import { firestoreGet, firestorePatch } from "./firestore";

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
};

function jsonResponse(
  data: unknown,
  status = 200
): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Invite accept
    if (
      url.pathname === "/invites/accept" &&
      request.method === "POST"
    ) {
      const user = await verifyFirebaseToken(
        request.headers.get("Authorization")
      );

      if (!user) {
        return jsonResponse(
          {
            success: false,
            message: "Unauthorized",
          },
          401
        );
      }

      try {
        const body = (await request.json()) as {
          uid?: string;
          email?: string;
        };

        const uid = body.uid?.trim();
        const email = body.email?.trim().toLowerCase();
        const authenticatedEmail =
          user.email?.trim().toLowerCase();

        if (!uid || !email) {
          return jsonResponse(
            {
              success: false,
              message: "uid and email are required",
            },
            400
          );
        }

        if (uid !== user.uid) {
          return jsonResponse(
            {
              success: false,
              message:
                "You can only accept an invite for your own account",
            },
            403
          );
        }

        if (
          !authenticatedEmail ||
          authenticatedEmail !== email
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "Invite email must match your authenticated account",
            },
            403
          );
        }

        const inviteId = email;

        const invite = await firestoreGet(
          env,
          `invites/${inviteId}`
        );

        if (!invite || typeof invite !== "object") {
          return jsonResponse(
            {
              success: false,
              message: "No invite found",
            },
            404
          );
        }

        const inviteData = invite as {
          fields?: Record<string, unknown>;
        };

        const fields = inviteData.fields || {};

        const getStringField = (name: string) => {
          const field = fields[name] as
            | { stringValue?: string }
            | undefined;

          return field?.stringValue || "";
        };

        const inviteEmail = getStringField("email")
          .trim()
          .toLowerCase();

        const status = getStringField("status");
        const role = getStringField("role");

        if (inviteEmail !== email) {
          return jsonResponse(
            {
              success: false,
              message: "Invite email does not match",
            },
            403
          );
        }

        if (status !== "pending") {
          return jsonResponse(
            {
              success: false,
              message: "Invite is no longer pending",
            },
            409
          );
        }

        if (role !== "admin") {
          return jsonResponse(
            {
              success: false,
              message: "Invalid invite role",
            },
            400
          );
        }

        const permissionsField = fields.permissions as
          | {
              arrayValue?: {
                values?: Array<{
                  stringValue?: string;
                }>;
              };
            }
          | undefined;

        const permissions =
          permissionsField?.arrayValue?.values
            ?.map((item) => item.stringValue)
            .filter(
              (value): value is string =>
                typeof value === "string" &&
                value.length > 0
            ) || [];

        await firestorePatch(
          env,
          `users/${uid}`,
          {
            role: "admin",
            permissions,
          }
        );

        await firestorePatch(
          env,
          `invites/${inviteId}`,
          {
            status: "accepted",
          }
        );

        return jsonResponse({
          success: true,
          message: "Invite accepted successfully",
          role: "admin",
          permissions,
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Invite acceptance failed",
          },
          500
        );
      }
    }

    // Health check
    if (url.pathname === "/api/health") {
      return jsonResponse({
        success: true,
        service: "LocalShop API",
        status: "online",
      });
    }

    // Protected Firestore test
    if (
      url.pathname === "/api/test/firestore" &&
      request.method === "GET"
    ) {
      const user = await verifyFirebaseToken(
        request.headers.get("Authorization")
      );

      if (!user) {
        return jsonResponse(
          {
            success: false,
            message: "Unauthorized",
          },
          401
        );
      }

      try {
        const result = await firestoreGet(
          env,
          `users/${user.uid}`
        );

        return jsonResponse({
          success: true,
          uid: user.uid,
          data: result,
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Firestore request failed",
          },
          500
        );
      }
    }

    return jsonResponse(
      {
        success: false,
        message: "Not Found",
      },
      404
    );
  },
} satisfies ExportedHandler<Env>;
