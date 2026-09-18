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
});
