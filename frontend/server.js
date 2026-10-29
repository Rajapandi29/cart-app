
const express = require("express");
const path = require("path");
const { DefaultAzureCredential } = require("@azure/identity");

const app = express();
const credential = new DefaultAzureCredential();

const PORT = process.env.PORT || 8080;
const APIM_URL = process.env.APIM_URL;
const APIM_SCOPE = process.env.APIM_SCOPE;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const publicDir = path.join(__dirname, "public");

// Read the authenticated principal provided by Azure App Service Easy Auth.
function principal(req) {
  const raw = req.headers["x-ms-client-principal"];
  if (!raw) return null;

  try {
    const p = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8")
    );

    const claims = p.claims || [];
    const getClaim = (...names) =>
      claims.find(c => names.includes(c.typ))?.val;

    const id = p.userId || getClaim("oid", "http://schemas.microsoft.com/identity/claims/objectidentifier");

    if (!id) return null;

    const groups = claims
      .filter(c =>
        c.typ === "groups" ||
        c.typ === "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
      )
      .map(c => c.val);

    return {
      id,
      name: p.userDetails || "Customer",
      roles: p.userRoles || [],
      groups
    };
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const user = principal(req);

  if (!user) {
    return res.status(401).json({ error: "Please sign in" });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (
    !ADMIN_GROUP_ID ||
    !req.user.groups.includes(ADMIN_GROUP_ID)
  ) {
    return res.status(403).json({
      error: "Administrator access required"
    });
  }

  next();
}

// Sign in and sign out use Azure App Service Authentication.
app.get("/login", (req, res) => {
  res.redirect("/.auth/login/aad?post_login_redirect_uri=%2F");
});

app.get("/logout", (req, res) => {
  res.redirect("/.auth/logout?post_logout_redirect_uri=%2F");
});

// Current authenticated user.
app.get("/api/me", requireUser, (req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    id: req.user.id,
    name: req.user.name,
    isAdmin:
      !!ADMIN_GROUP_ID &&
      req.user.groups.includes(ADMIN_GROUP_ID)
  });
});

// Authenticate protected API requests before proxying them to APIM.
// Product catalogue GET requests are public.
app.use("/api", (req, res, next) => {
  if (
    req.method === "GET" &&
    req.path === "/products"
  ) {
    return next();
  }

  requireUser(req, res, () => {
    if (req.path.startsWith("/admin/")) {
      return requireAdmin(req, res, next);
    }

    next();
  });
});

// Forward API requests to API Management.
app.use("/api", async (req, res) => {
  try {
    if (!APIM_URL || !APIM_SCOPE) {
      return res.status(500).json({
        error: "APIM configuration missing"
      });
    }

    const token = await credential.getToken(APIM_SCOPE);

    if (!token) {
      throw new Error("Managed identity token unavailable");
    }

    const headers = {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json"
    };

    // Forward identity only for authenticated requests.
    if (req.user) {
      headers["X-App-User-Id"] = req.user.id;
      headers["X-App-User-Name"] = req.user.name;
      headers["X-App-Admin"] =
        ADMIN_GROUP_ID &&
        req.user.groups.includes(ADMIN_GROUP_ID)
          ? "true"
          : "false";
    }

    const upstream = await fetch(
      `${APIM_URL.replace(/\/+$/, "")}${req.originalUrl.replace(/^\/api/, "")}`,
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : JSON.stringify(req.body),
        signal: AbortSignal.timeout(20000)
      }
    );

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");

    res.status(upstream.status);
    res.set("Cache-Control", "no-store");

    if (contentType) {
      res.set("Content-Type", contentType);
    }

    res.send(body);
  } catch (error) {
    console.error("APIM request failed:", error.message);

    res.status(502).json({
      error: "Shopping service unavailable"
    });
  }
});

// Serve the frontend.
app.use(express.static(publicDir));

app.get("*path", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SprintCart listening on ${PORT}`);
});
