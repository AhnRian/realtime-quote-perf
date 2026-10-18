import fixtures from "../../../fixtures/stock-details.json";
import type { StockDetail } from "@/lib/types";

// SSR 종목 상세 데이터 함수 (spec 6.1, 6.2).
// 페이지는 이 함수로만 데이터를 가져온다. 부하 테스트 때는 API_MOCK=1로 백엔드 없이 고정 데이터 + 지연을 돌려준다.

/** 백엔드 응답 시간 흉내 */
export const MOCK_DELAY_MS = 50;

const details: Record<string, StockDetail> = fixtures;

export async function getStockDetail(code: string): Promise<StockDetail | null> {
  if (process.env.API_MOCK !== "1") {
    // 실제 백엔드는 이 프로젝트 범위 밖이다 (spec 2. 제외)
    throw new Error("종목 상세 백엔드가 연결되어 있지 않습니다. API_MOCK=1로 실행하세요.");
  }
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return details[code] ?? null;
}
