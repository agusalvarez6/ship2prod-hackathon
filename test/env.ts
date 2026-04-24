export const REDIS_TEST_URL =
  process.env["REDIS_TEST_URL"] ?? "redis://localhost:6380";

export const POSTGRES_TEST_URL =
  process.env["POSTGRES_TEST_URL"] ??
  "postgres://postgres:postgres@localhost:5433/postgres";
