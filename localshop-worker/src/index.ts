import { verifyFirebaseToken } from "./firebaseAuth";
import {
  firestoreGet,
  firestorePatch,
  firestoreCommit,
  firestoreDocument,
  documentToObject,
} from "./firestore";

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://localshop.localshop-api-bd.workers.dev",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
  };
}

function jsonResponse(
  data: unknown,
  status = 200,
  origin: string | null = null
): Response {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(origin),
  });
}

async function getDocument(
  env: Env,
  path: string
): Promise<any | null> {
  try {
    const document = await firestoreGet(env, path);
    return documentToObject(document);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    // =====================================================
    // CREATE ORDER
    // =====================================================

    if (
      url.pathname === "/orders" &&
      request.method === "POST"
    ) {
      const firebaseUser = await verifyFirebaseToken(
        request.headers.get("Authorization")
      );

      if (!firebaseUser) {
        return jsonResponse(
          {
            success: false,
            error: "Unauthorized",
          },
          401,
          origin
        );
      }

      try {
        const profile = await getDocument(
          env,
          `users/${firebaseUser.uid}`
        );

        if (!profile) {
          return jsonResponse(
            {
              success: false,
              error: "User profile not found.",
            },
            404,
            origin
          );
        }

        if (profile.role !== "customer") {
          return jsonResponse(
            {
              success: false,
              error: "Only customers can place orders.",
            },
            403,
            origin
          );
        }

        if (
          profile.status &&
          profile.status !== "active"
        ) {
          return jsonResponse(
            {
              success: false,
              error: "Your account is not active.",
            },
            403,
            origin
          );
        }

        const body = (await request.json()) as {
          phone?: string;
          address?: string;
          paymentMethod?: string;
          items?: Array<{
            productId?: string;
            quantity?: number;
          }>;
        };

        const phone = String(
          body.phone || ""
        ).trim();

        const address = String(
          body.address || ""
        ).trim();

        const paymentMethod = String(
          body.paymentMethod || "Cash on Delivery"
        ).trim();

        const items = Array.isArray(body.items)
          ? body.items
          : [];

        if (!phone) {
          return jsonResponse(
            {
              success: false,
              error: "Phone number is required.",
            },
            400,
            origin
          );
        }

        if (!address) {
          return jsonResponse(
            {
              success: false,
              error: "Delivery address is required.",
            },
            400,
            origin
          );
        }

        if (
          !items.length ||
          items.length > 20
        ) {
          return jsonResponse(
            {
              success: false,
              error: "Invalid order items.",
            },
            400,
            origin
          );
        }

        const cleanItems: Array<{
          productId: string;
          quantity: number;
        }> = [];

        for (const item of items) {
          const productId = String(
            item?.productId || ""
          ).trim();

          const quantity = Number(
            item?.quantity
          );

          if (
            !productId ||
            !Number.isInteger(quantity) ||
            quantity <= 0
          ) {
            return jsonResponse(
              {
                success: false,
                error: "Invalid product quantity.",
              },
              400,
              origin
            );
          }

          cleanItems.push({
            productId,
            quantity,
          });
        }

        // -------------------------------------------------
        // Load products
        // -------------------------------------------------

        const products = await Promise.all(
          cleanItems.map((item) =>
            getDocument(
              env,
              `products/${encodeURIComponent(
                item.productId
              )}`
            )
          )
        );

        if (
          products.some(
            (product) => !product
          )
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "One or more products no longer exist.",
            },
            400,
            origin
          );
        }

        const firstProduct = products[0];

        const shopId = firstProduct.shopId;
        const merchantId = firstProduct.ownerId;

        if (!shopId || !merchantId) {
          return jsonResponse(
            {
              success: false,
              error:
                "Product configuration is invalid.",
            },
            400,
            origin
          );
        }

        // -------------------------------------------------
        // Make sure every product belongs to same shop
        // -------------------------------------------------

        if (
          products.some(
            (product) =>
              product.shopId !== shopId ||
              product.ownerId !== merchantId
          )
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please order products from one shop at a time.",
            },
            400,
            origin
          );
        }

        // -------------------------------------------------
        // Load shop
        // -------------------------------------------------

        const shop = await getDocument(
          env,
          `shops/${encodeURIComponent(shopId)}`
        );

        if (!shop) {
          return jsonResponse(
            {
              success: false,
              error: "Shop no longer exists.",
            },
            400,
            origin
          );
        }

        if (
          shop.status !== "active" ||
          shop.verificationStatus !== "verified"
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "This shop is not currently available.",
            },
            400,
            origin
          );
        }

        if (shop.ownerId !== merchantId) {
          return jsonResponse(
            {
              success: false,
              error:
                "Shop ownership is invalid.",
            },
            400,
            origin
          );
        }

        // -------------------------------------------------
        // Validate price + stock
        // -------------------------------------------------

        const orderItems: Array<{
          productId: string;
          productName: string;
          price: number;
          quantity: number;
          total: number;
        }> = [];

        let subtotal = 0;

        for (
          let index = 0;
          index < products.length;
          index++
        ) {
          const product = products[index];
          const requestItem =
            cleanItems[index];

          const available = Number(
            product.quantity || 0
          );

          const price = Number(
            product.price
          );

          if (
            !Number.isFinite(price) ||
            price < 0
          ) {
            return jsonResponse(
              {
                success: false,
                error: `Invalid price for ${
                  product.productName ||
                  "product"
                }.`,
              },
              400,
              origin
            );
          }

          if (
            available <
            requestItem.quantity
          ) {
            return jsonResponse(
              {
                success: false,
                error: `${
                  product.productName ||
                  "Product"
                } does not have enough stock.`,
              },
              409,
              origin
            );
          }

          const lineTotal =
            price * requestItem.quantity;

          subtotal += lineTotal;

          orderItems.push({
            productId:
              requestItem.productId,
            productName:
              product.productName || "",
            price,
            quantity:
              requestItem.quantity,
            total: lineTotal,
          });
        }

        if (subtotal <= 0) {
          return jsonResponse(
            {
              success: false,
              error:
                "Order total must be greater than zero.",
            },
            400,
            origin
          );
        }

        // -------------------------------------------------
        // Create order + update stock
        // -------------------------------------------------

        const now =
          new Date().toISOString();

        const orderId =
          crypto.randomUUID();

        const orderName =
          `projects/${env.FIREBASE_PROJECT_ID}` +
          `/databases/(default)/documents/orders/${orderId}`;

        const writes: Array<
          Record<string, unknown>
        > = [];

        // Update product stock
        for (
          let index = 0;
          index < products.length;
          index++
        ) {
          const product = products[index];

          const requestItem =
            cleanItems[index];

          const newQuantity =
            Number(product.quantity || 0) -
            requestItem.quantity;

          writes.push({
            update: firestoreDocument(
              product._name as string,
              {
                quantity: newQuantity,
                updatedAt: now,
              }
            ),

            updateMask: {
              fieldPaths: [
                "quantity",
                "updatedAt",
              ],
            },

            currentDocument: {
              updateTime:
                product._updateTime,
            },
          });
        }

        // Create order
        writes.push({
          update: firestoreDocument(
            orderName,
            {
              customerId:
                firebaseUser.uid,

              customerName:
                profile.name || "",

              customerEmail:
                firebaseUser.email ||
                profile.email ||
                "",

              phone,
              address,

              merchantId,
              shopId,

              shopName:
                shop.shopName ||
                "LocalShop Merchant",

              items: orderItems,

              subtotal,

              deliveryFee: 0,

              total: subtotal,

              paymentMethod,

              paymentStatus:
                "pending",

              orderStatus:
                "pending",

              statusHistory: [
                {
                  status: "pending",
                  note: "Order placed",
                  courierName: "",
                  trackingCode: "",
                  updatedAt: now,
                },
              ],

              courierName: "",
              trackingCode: "",

              createdAt: now,
              updatedAt: now,
            }
          ),

          currentDocument: {
            exists: false,
          },
        });

        try {
          await firestoreCommit(
            env,
            writes
          );
        } catch (error) {
          return jsonResponse(
            {success: false,
error:
  error instanceof Error
    ? error.message
    : String(error),
            },
            409,
            origin
          );
        }

        return jsonResponse(
          {
            success: true,
            orderId,
            message:
              "Order placed successfully!",
          },
          201,
          origin
        );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to place your order.",
          },
          500,
          origin
        );
      }
    }

    // =====================================================
    // INVITE ACCEPT
    // =====================================================

    if (
      url.pathname === "/invites/accept" &&
      request.method === "POST"
    ) {
      const user =
        await verifyFirebaseToken(
          request.headers.get(
            "Authorization"
          )
        );

      if (!user) {
        return jsonResponse(
          {
            success: false,
            message: "Unauthorized",
          },
          401,
          origin
        );
      }

      try {
        const body =
          (await request.json()) as {
            uid?: string;
            email?: string;
          };

        const uid =
          body.uid?.trim();

        const email =
          body.email
            ?.trim()
            .toLowerCase();

        const authenticatedEmail =
          user.email
            ?.trim()
            .toLowerCase();

        if (!uid || !email) {
          return jsonResponse(
            {
              success: false,
              message:
                "uid and email are required",
            },
            400,
            origin
          );
        }

        if (uid !== user.uid) {
          return jsonResponse(
            {
              success: false,
              message:
                "You can only accept an invite for your own account",
            },
            403,
            origin
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
            403,
            origin
          );
        }

        const inviteId = email;

        const invite =
          await firestoreGet(
            env,
            `invites/${inviteId}`
          );

        if (
          !invite ||
          typeof invite !== "object"
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "No invite found",
            },
            404,
            origin
          );
        }

        const inviteData =
          invite as {
            fields?: Record<
              string,
              unknown
            >;
          };

        const fields =
          inviteData.fields || {};

        const getStringField = (
          name: string
        ) => {
          const field =
            fields[name] as
              | {
                  stringValue?: string;
                }
              | undefined;

          return (
            field?.stringValue || ""
          );
        };

        const inviteEmail =
          getStringField("email")
            .trim()
            .toLowerCase();

        const status =
          getStringField("status");

        const role =
          getStringField("role");

        if (
          inviteEmail !== email
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "Invite email does not match",
            },
            403,
            origin
          );
        }

        if (status !== "pending") {
          return jsonResponse(
            {
              success: false,
              message:
                "Invite is no longer pending",
            },
            409,
            origin
          );
        }

        if (role !== "admin") {
          return jsonResponse(
            {
              success: false,
              message:
                "Invalid invite role",
            },
            400,
            origin
          );
        }

        const permissionsField =
          fields.permissions as
            | {
                arrayValue?: {
                  values?: Array<{
                    stringValue?: string;
                  }>;
                };
              }
            | undefined;

        const permissions =
          permissionsField
            ?.arrayValue?.values
            ?.map(
              (item) =>
                item.stringValue
            )
            .filter(
              (
                value
              ): value is string =>
                typeof value ===
                  "string" &&
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

        return jsonResponse(
          {
            success: true,
            message:
              "Invite accepted successfully",
            role: "admin",
            permissions,
          },
          200,
          origin
        );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Invite acceptance failed",
          },
          500,
          origin
        );
      }
    }

    // =====================================================
    // HEALTH CHECK
    // =====================================================

    if (
      url.pathname === "/api/health"
    ) {
      return jsonResponse(
        {
          success: true,
          service: "LocalShop API",
          status: "online",
        },
        200,
        origin
      );
    }

    // =====================================================
    // PROTECTED FIRESTORE TEST
    // =====================================================

    if (
      url.pathname ===
        "/api/test/firestore" &&
      request.method === "GET"
    ) {
      const user =
        await verifyFirebaseToken(
          request.headers.get(
            "Authorization"
          )
        );

      if (!user) {
        return jsonResponse(
          {
            success: false,
            message: "Unauthorized",
          },
          401,
          origin
        );
      }

      try {
        const result =
          await firestoreGet(
            env,
            `users/${user.uid}`
          );

        return jsonResponse(
          {
            success: true,
            uid: user.uid,
            data: result,
          },
          200,
          origin
        );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Firestore request failed",
          },
          500,
          origin
        );
      }
    }

    // =====================================================
    // NOT FOUND
    // =====================================================

    return jsonResponse(
      {
        success: false,
        message: "Not Found",
      },
      404,
      origin
    );
  },
} satisfies ExportedHandler<Env>;
