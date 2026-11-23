// Runs before any test file imports backend code, so config/env.ts sees these
// values. dotenv never overrides a variable that is already set, so the root
// .env (whose MONGO_URI is the real Atlas cluster) can't leak into tests.
//
// Tests wipe their database between cases, so both stores must be throwaway:
// a local Mongo database whose name ends in `_test`, and a local Redis on a
// non-zero DB index (the dev server uses DB 0). Override with TEST_MONGO_URI /
// TEST_REDIS_URL; anything else is refused before a single test runs.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const mongoUri = process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:27017/flowsync_test";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15";

const mongo = new URL(mongoUri);
const mongoDb = mongo.pathname.replace(/^\//, "");
if (mongo.protocol !== "mongodb:" || !LOCAL_HOSTS.has(mongo.hostname) || !mongoDb.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against ${mongo.host}/${mongoDb}: TEST_MONGO_URI must be a local mongodb:// URI whose database name ends in "_test".`,
  );
}

const redis = new URL(redisUrl);
const redisDb = Number(redis.pathname.replace(/^\//, "") || "0");
if (!LOCAL_HOSTS.has(redis.hostname) || !Number.isInteger(redisDb) || redisDb === 0) {
  throw new Error(
    `Refusing to run tests against Redis ${redis.host} DB ${redisDb}: TEST_REDIS_URL must be a local Redis with a non-zero DB index (e.g. redis://127.0.0.1:6379/15).`,
  );
}

Object.assign(process.env, {
  NODE_ENV: "test",
  MONGO_URI: mongoUri,
  REDIS_URL: redisUrl,
  JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
  JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  CORS_ORIGIN: "http://localhost:3000",
  COOKIE_DOMAIN: "localhost",
  // Set (SMTP_URL to empty, i.e. off) so .env's real mail settings can't
  // load: tests capture mail in testOutbox and must never reach an SMTP server.
  APP_URL: "http://localhost:3000",
  SMTP_URL: "",
});
