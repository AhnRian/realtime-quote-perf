import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_DELAY_MS, getStockDetail } from "./stock-detail";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getStockDetail", () => {
  it("API_MOCK=1이면 fixture를 50ms 지연 후 돌려주고 네트워크를 호출하지 않는다", async () => {
    vi.stubEnv("API_MOCK", "1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const start = performance.now();
    const detail = await getStockDetail("005930");
    expect(performance.now() - start).toBeGreaterThanOrEqual(MOCK_DELAY_MS - 2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(detail?.name).toBe("삼성전자");
    expect(detail?.book.asks).toHaveLength(10);
    expect(detail?.trades).toHaveLength(50);
    expect(detail?.news).toHaveLength(20);
  });

  it("없는 종목이면 null", async () => {
    vi.stubEnv("API_MOCK", "1");
    expect(await getStockDetail("000000")).toBeNull();
  });

  it("API_MOCK이 아니면 백엔드가 없다는 오류를 낸다", async () => {
    vi.stubEnv("API_MOCK", "");
    await expect(getStockDetail("005930")).rejects.toThrow("API_MOCK=1");
  });
});
