
const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");
const { randomUUID } = require("crypto");

const account = process.env.STORAGE_ACCOUNT_NAME;
if (!account) throw new Error("STORAGE_ACCOUNT_NAME is required");

const service = new BlobServiceClient(
  `https://${account}.blob.core.windows.net`,
  new DefaultAzureCredential()
);

const containers = {
  products: "products",
  orders: "orders",
  profiles: "profiles"
};

function safeId(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

async function container(name) {
  const client = service.getContainerClient(name);
  await client.createIfNotExists();
  return client;
}

async function list(name) {
  const c = await container(name);
  const items = [];

  for await (const blob of c.listBlobsFlat()) {
    const client = c.getBlockBlobClient(blob.name);
    const data = await client.downloadToBuffer();
    items.push(JSON.parse(data.toString("utf8")));
  }

  return items;
}

async function read(name, id) {
  const c = await container(name);
  const blob = c.getBlockBlobClient(`${safeId(id)}.json`);

  if (!(await blob.exists())) return null;

  const data = await blob.downloadToBuffer();
  return JSON.parse(data.toString("utf8"));
}

async function write(name, id, value) {
  const c = await container(name);
  const blob = c.getBlockBlobClient(`${safeId(id)}.json`);

  await blob.uploadData(
    Buffer.from(JSON.stringify(value)),
    {
      blobHTTPHeaders: {
        blobContentType: "application/json",
        blobCacheControl: "no-store"
      }
    }
  );

  return value;
}

async function seedProducts() {
  const existing = await list(containers.products);
  if (existing.length) return;

  const demo = [
    { id: "shoe-101", name: "Cloud Runner", category: "Shoes", price: 4299, stock: 20, image: "" },
    { id: "shoe-102", name: "Velocity Court", category: "Shoes", price: 3699, stock: 15, image: "" },
    { id: "wear-201", name: "Motion Training Tee", category: "Clothing", price: 999, stock: 40, image: "" },
    { id: "wear-202", name: "Flex Performance Shorts", category: "Clothing", price: 1299, stock: 25, image: "" },
    { id: "gear-301", name: "Sprint Sports Bottle", category: "Accessories", price: 499, stock: 50, image: "" },
    { id: "gear-302", name: "Active Training Bag", category: "Accessories", price: 1599, stock: 12, image: "" }
  ];

  for (const product of demo) {
    await write(containers.products, product.id, product);
  }
}

async function products() {
  await seedProducts();
  return list(containers.products);
}

async function addProduct(input) {
  const product = {
    id: randomUUID(),
    name: input.name.trim(),
    category: input.category,
    price: input.price,
    stock: input.stock,
    image: input.image || ""
  };

  return write(containers.products, product.id, product);
}

async function saveOrder(userId, input) {
  const allProducts = await products();
  const lines = [];
  let total = 0;

  for (const item of input.items) {
    const product = allProducts.find(p => p.id === item.productId);

    if (!product || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 10) {
      throw new Error("Invalid product or quantity");
    }

    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    lines.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: item.quantity
    });

    total += product.price * item.quantity;
  }

  // Demo implementation: suitable for a prototype only.
  // Concurrent checkout requires transactional inventory storage.
  for (const line of lines) {
    const product = allProducts.find(p => p.id === line.productId);
    product.stock -= line.quantity;
    await write(containers.products, product.id, product);
  }

  const order = {
    id: randomUUID(),
    userId,
    items: lines,
    total,
    currency: "INR",
    status: "Confirmed",
    paymentStatus: "NotPaid",
    createdAt: new Date().toISOString()
  };

  await write(containers.orders, order.id, order);
  return order;
}

async function userOrders(userId) {
  const orders = await list(containers.orders);
  return orders
    .filter(order => order.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

module.exports = {
  products,
  addProduct,
  saveOrder,
  userOrders
};
