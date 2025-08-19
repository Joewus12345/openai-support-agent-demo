import Redis from "ioredis";

const url = process.env.REDIS_URL;

const createNoop = () => ({
  async get() {
    return null;
  },
  async set() {
    return null;
  },
  async ping() {
    return "PONG";
  },
  async quit() {
    return;
  },
});

const redis = url
  ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0 })
  : createNoop();

if (url && typeof (redis as any).on === "function") {
  (redis as any).on("error", () => {});
  (redis as any).connect().catch(() => {});
}

export default redis as any;
