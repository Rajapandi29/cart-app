
const { app } = require("@azure/functions");
const store = require("../../shared/store");

function userId(request) {
  return request.headers.get("x-app-user-id");
}

function isAdmin(request) {
  return request.headers.get("x-app-admin") === "true";
}

app.http("products", {
  methods: ["GET"],
  authLevel: "function",
  route: "products",
  handler: async () => {
    try {
      return {
        status: 200,
        jsonBody: { items: await store.products() },
        headers: { "Cache-Control": "no-store" }
      };
    } catch (error) {
      console.error(error);
      return { status: 500, jsonBody: { error: "Unable to load products" } };
    }
  }
});

app.http("orders", {
  methods: ["GET", "POST"],
  authLevel: "function",
  route: "orders",
  handler: async (request, context) => {
    const id = userId(request);
    if (!id) return { status: 401, jsonBody: { error: "Authentication required" } };

    try {
      if (request.method === "GET") {
        return {
          status: 200,
          jsonBody: { items: await store.userOrders(id) },
          headers: { "Cache-Control": "no-store" }
        };
      }

      const input = await request.json();

      if (!Array.isArray(input.items) ||
          input.items.length < 1 ||
          input.items.length > 30) {
        return { status: 400, jsonBody: { error: "Invalid order items" } };
      }

      const order = await store.saveOrder(id, input);
      return { status: 201, jsonBody: order };
    } catch (error) {
      context.error(error);
      return { status: 400, jsonBody: { error: error.message || "Order failed" } };
    }
  }
});

app.http("adminProducts", {
  methods: ["POST"],
  authLevel: "function",
  route: "admin/products",
  handler: async (request, context) => {
    if (!userId(request) || !isAdmin(request)) {
      return { status: 403, jsonBody: { error: "Administrator access required" } };
    }

    try {
      const input = await request.json();

      if (typeof input.name !== "string" ||
          !input.name.trim() ||
          input.name.length > 100 ||
          !["Shoes", "Clothing", "Accessories"].includes(input.category) ||
          !Number.isFinite(input.price) || input.price < 1 ||
          input.price > 1000000 ||
          !Number.isInteger(input.stock) || input.stock < 0 ||
          input.stock > 100000) {
        return { status: 400, jsonBody: { error: "Invalid product data" } };
      }

      if (input.image && (
          typeof input.image !== "string" ||
          !input.image.startsWith("https://") ||
          input.image.length > 2000
      )) {
        return { status: 400, jsonBody: { error: "Image must be an HTTPS URL" } };
      }

      const product = await store.addProduct(input);
      return { status: 201, jsonBody: product };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { error: "Unable to create product" } };
    }
  }
});
