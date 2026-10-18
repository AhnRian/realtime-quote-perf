// 메시지·도메인 타입 정의 (spec 7장)

/** 서버 → 브라우저 내부 프레임 */
export type Frame = {
  /** 서버 전송 시각 (ms, Date.now()) */
  t: number;
  /** KIS 실시간 원문 형식 문자열 */
  raw: string;
};

/** 체결 (H0STCNT0) */
export type Tick = {
  code: string;
  /** 체결시간 HHMMSS */
  time: string;
  price: number;
  /** 전일대비 (하락이면 음수) */
  change: number;
  /** 전일대비율 % (하락이면 음수) */
  rate: number;
  tradeVol: number;
  accVol: number;
  sentAt: number;
};

export type Level = { price: number; qty: number };

/** 10단 호가 (H0STASP0). asks[0]·bids[0]이 최우선 호가 */
export type OrderBook = {
  code: string;
  asks: Level[];
  bids: Level[];
  sentAt: number;
};

export type MarketEvent =
  | { type: "tick"; tick: Tick }
  | { type: "book"; book: OrderBook };

export type RenderMode = "naive" | "batched" | "optimized";

/** 데이터 소스. worker는 제출 후(T11) */
export type DataSource = "mock" | "kis";

/** Mock 서버 접속 파라미터 (spec 8장) */
export type MockParams = {
  rate: number;
  symbols: number;
  burst: boolean;
  seed: number;
};

export type NewsItem = {
  id: number;
  title: string;
  source: string;
  /** ISO 8601 */
  publishedAt: string;
};

/** SSR 종목 상세 페이지 데이터 (spec 6.1) */
export type StockDetail = {
  code: string;
  name: string;
  quote: Tick;
  book: OrderBook;
  /** 최근 체결 50건, 최신이 앞 */
  trades: Tick[];
  /** 관련 뉴스 20건, 최신이 앞 */
  news: NewsItem[];
};

/** 30초 측정 결과 (spec 10장) */
export type MeasureResult = {
  mode: RenderMode;
  source: DataSource;
  /** Mock 목표 rate. kis 소스는 조절할 수 없으므로 null */
  rate: number | null;
  fps: number;
  fpsMin: number;
  renders: number;
  messages: number;
  longTasks: number;
  longTaskMs: number;
  p50: number;
  p95: number;
};
