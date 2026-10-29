
const $ = (id) => document.getElementById(id);

let products = [];
let cart = [];
let currentCategory = "All";
let signedIn = false;
let adminEnabled = false;

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notify(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  setTimeout(() => { $("toast").hidden = true; }, 2800);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    if (signedIn) window.location.assign("/login");
    throw new Error("Please sign in to continue.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadAccount() {
  try {
    const me = await api("/api/me");
    signedIn = true;
    $("userName").textContent = me.name;
    $("loginLink").hidden = true;
    $("logoutLink").hidden = false;
    $("adminNav").hidden = !me.isAdmin;
    $("admin").hidden = !me.isAdmin;
    adminEnabled = !!me.isAdmin;
    await loadOrders();
  } catch {
    signedIn = false;
    $("userName").textContent = "Guest";
    $("loginLink").hidden = false;
    $("logoutLink").hidden = true;
    $("ordersList").textContent = "Sign in to view your orders.";
  }
}

async function loadProducts() {
  $("products").innerHTML = "<p>Loading products…</p>";

  try {
    const result = await api("/api/products");
    products = result.items || [];
    renderProducts();
  } catch (error) {
    $("products").innerHTML =
      `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderProducts() {
  const query = $("search").value.trim().toLowerCase();

  const filtered = products.filter((p) =>
    (currentCategory === "All" || p.category === currentCategory) &&
    `${p.name} ${p.category}`.toLowerCase().includes(query)
  );

  if (!filtered.length) {
    $("products").innerHTML = "<p>No matching products found.</p>";
    return;
  }

  $("products").innerHTML = filtered.map((p, index) => `
    <article class="product">
      <div class="product-art art-${index % 4}">
        ${p.image
          ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
          : `<span>${escapeHtml(p.category)}</span><b>${escapeHtml(p.name)}</b>`}
      </div>
      <div class="product-info">
        <div><span class="category-label">${escapeHtml(p.category)}</span>
        <h3>${escapeHtml(p.name)}</h3></div>
        <strong>${money(p.price)}</strong>
      </div>
      <p class="stock">${p.stock > 0 ? "In stock" : "Sold out"}</p>
      <button class="button add-button" data-add="${escapeHtml(p.id)}"
        ${p.stock <= 0 ? "disabled" : ""}>Add to bag</button>
    </article>
  `).join("");
}

function renderCart() {
  $("cartCount").textContent = cart.reduce((n, item) => n + item.quantity, 0);

  $("cartItems").innerHTML = cart.map((item) => `
    <div class="cart-item">
      <div><strong>${escapeHtml(item.name)}</strong>
        <p>${money(item.price)} × ${item.quantity}</p></div>
      <div class="quantity">
        <button data-minus="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
        <span>${item.quantity}</span>
        <button data-plus="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
      </div>
    </div>
  `).join("") || "<p>Your bag is empty.</p>";

  $("cartTotal").textContent = money(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
}

function addToCart(id) {
  const product = products.find((p) => p.id === id);
  if (!product || product.stock <= 0) return;

  const item = cart.find((p) => p.id === id);
  if (item) {
    if (item.quantity >= product.stock) return notify("Maximum available stock reached.");
    item.quantity++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  renderCart();
  notify("Added to your bag.");
}

async function loadOrders() {
  if (!signedIn) return;

  try {
    const result = await api("/api/orders");
    const items = result.items || [];

    $("ordersList").innerHTML = items.length ? items.map((order) => `
      <article class="order-card">
        <div><strong>Order ${escapeHtml(order.id)}</strong>
        <p>${escapeHtml(new Date(order.createdAt).toLocaleDateString())}</p></div>
        <div><span class="status">${escapeHtml(order.status)}</span>
        <strong>${money(order.total)}</strong></div>
      </article>
    `).join("") : "<p>No orders yet. Find something you love!</p>";
  } catch (error) {
    $("ordersList").textContent = error.message;
  }
}

$("search").addEventListener("input", renderProducts);

$("categories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  currentCategory = button.dataset.category;
  $("categories").querySelectorAll("button").forEach((b) =>
    b.classList.toggle("active", b === button)
  );
  renderProducts();
});

$("products").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

$("cartToggle").addEventListener("click", () => {
  $("cartPanel").hidden = false;
});

$("closeCart").addEventListener("click", () => {
  $("cartPanel").hidden = true;
});

$("cartItems").addEventListener("click", (event) => {
  const minus = event.target.closest("[data-minus]");
  const plus = event.target.closest("[data-plus]");
  const id = minus?.dataset.minus || plus?.dataset.plus;
  if (!id) return;

  const item = cart.find((p) => p.id === id);
  const product = products.find((p) => p.id === id);
  if (!item) return;

  if (minus) item.quantity--;
  if (plus && item.quantity < (product?.stock || 0)) item.quantity++;

  cart = cart.filter((p) => p.quantity > 0);
  renderCart();
});

$("checkout").addEventListener("click", async () => {
  if (!signedIn) {
    window.location.assign("/login");
    return;
  }
  if (!cart.length) return notify("Your bag is empty.");

  $("checkout").disabled = true;

  try {
    const order = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: cart.map(({ id, quantity }) => ({ productId: id, quantity }))
      })
    });

    cart = [];
    renderCart();
    await loadProducts();
    await loadOrders();
    notify(`Order ${order.id} placed successfully.`);
  } catch (error) {
    notify(error.message);
  } finally {
    $("checkout").disabled = false;
  }
});

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminEnabled) return notify("Administrator access required.");

  const form = new FormData(event.currentTarget);

  try {
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        category: form.get("category"),
        price: Number(form.get("price")),
        image: form.get("image"),
        stock: Number(form.get("stock"))
      })
    });

    event.currentTarget.reset();
    $("adminMessage").textContent = "Product created.";
    await loadProducts();
  } catch (error) {
    $("adminMessage").textContent = error.message;
  }
});

Promise.all([loadAccount(), loadProducts()]).then(renderCart);
