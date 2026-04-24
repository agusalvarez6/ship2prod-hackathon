#!/usr/bin/env node
// Chainguard-compatible health probe. No curl in the distroless runtime,
// so we hit GET /health with the node:http client and exit 0 on 200.
// Each service mounts its own port via the HEALTHCHECK_PORT env var, or
// falls back to PORT, or to 8080.

import { get } from "node:http";

const port = Number(
  process.env.HEALTHCHECK_PORT ?? process.env.PORT ?? 8080,
);
const host = process.env.HEALTHCHECK_HOST ?? "127.0.0.1";
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 2000);

const req = get(
  { host, port, path: "/health", timeout: timeoutMs },
  (res) => {
    if (res.statusCode === 200) {
      res.resume();
      process.exit(0);
    }
    console.error(`healthcheck: status ${res.statusCode}`);
    process.exit(1);
  },
);

req.on("error", (err) => {
  console.error(`healthcheck: ${err.message}`);
  process.exit(1);
});

req.on("timeout", () => {
  req.destroy();
  console.error("healthcheck: timeout");
  process.exit(1);
});
