import { execa } from "execa";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const COMPOSE_FILE = path.join(REPO_ROOT, "docker-compose.test.yml");

const SKIP = process.env["SKIP_DOCKER"] === "1";

async function compose(args: string[]): Promise<void> {
  await execa("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

async function waitForHealthy(service: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { stdout } = await execa(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "ps", "--format", "json", service],
      { cwd: REPO_ROOT },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    const records = lines.map((line) => JSON.parse(line) as { Health?: string; State?: string });
    const record = records[0];
    if (record?.Health === "healthy") return;
    if (record?.State === "exited") {
      throw new Error(`service ${service} exited before becoming healthy`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`service ${service} did not become healthy within ${timeoutMs}ms`);
}

export async function setup(): Promise<void> {
  if (SKIP) return;
  await compose(["up", "-d", "--wait", "redis", "postgres"]);
  await waitForHealthy("redis");
  await waitForHealthy("postgres");
}

export async function teardown(): Promise<void> {
  if (SKIP) return;
  if (process.env["KEEP_DOCKER"] === "1") return;
  await compose(["down", "-v", "--remove-orphans"]);
}
