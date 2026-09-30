import { DoctorCacheService } from "../src/modules/doctor/doctor-cache.service";

describe("DoctorCacheService", () => {
  it("creates deterministic SHA-256 keys scoped by namespace", () => {
    const cache = new DoctorCacheService();
    const filters = { q: "tim mạch", page: 1, limit: 10 };

    const first = cache.key("list", filters);
    const second = cache.key("list", filters);

    expect(first).toBe(second);
    expect(first).toMatch(/^ehealth:doctor:list:[a-f0-9]{64}$/);
    expect(cache.key("detail", filters)).not.toBe(first);
    expect(cache.key("list", { ...filters, page: 2 })).not.toBe(first);
  });

  it("treats an unavailable Redis client as a cache miss", async () => {
    const cache = new DoctorCacheService();

    await expect(cache.getJson("cache-key")).resolves.toBeNull();
    await expect(cache.setJson("cache-key", { value: true })).resolves.toBe(
      undefined,
    );
    expect(cache.stats()).toEqual({ hits: 0, misses: 1, hitRate: 0 });
  });

  it("does not fail the request when Redis invalidation throws", async () => {
    const cache = new DoctorCacheService();
    const failingClient = {
      isReady: true,
      scanIterator: () => ({
        async *[Symbol.asyncIterator]() {
          throw new Error("Redis unavailable");
        },
      }),
      del: jest.fn(),
    };
    (cache as unknown as { client: typeof failingClient }).client = failingClient;

    await expect(cache.invalidateDoctorData("doctor-id")).resolves.toBeUndefined();
    expect(failingClient.del).not.toHaveBeenCalled();
  });

  it("invalidates cached doctor lists and the reviewed doctor detail", async () => {
    const cache = new DoctorCacheService();
    const client = {
      isReady: true,
      scanIterator: () => ({
        async *[Symbol.asyncIterator]() {
          yield ["ehealth:doctor:list:first", "ehealth:doctor:list:second"];
        },
      }),
      del: jest.fn().mockResolvedValue(3),
    };
    (cache as unknown as { client: typeof client }).client = client;
    const detailKey = cache.key("detail", "doctor-id");

    await cache.invalidateDoctorData("doctor-id");

    expect(client.del).toHaveBeenCalledWith([
      "ehealth:doctor:list:first",
      "ehealth:doctor:list:second",
      detailKey,
      cache.key("detail-v2", "doctor-id"),
    ]);
  });
});
