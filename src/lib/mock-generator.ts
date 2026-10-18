import { BOOK_LEVELS, BOOK_USED_FIELD_COUNT, TICK_FIELD, TICK_FIELD_COUNT, TR_BOOK, TR_TICK } from "./kis-fields";
import { alignToTick, tickDown, tickUp } from "./tick-size";

// KIS 원문 형식의 가상 시세 생성기 (spec 8장).
// Mock 서버와 (제출 후) Web Worker가 같이 쓰도록 Node·브라우저 API에 의존하지 않는 순수 로직으로 둔다.

const NAMES = [
  "한빛전자", "누리바이오", "가람화학", "다온반도체", "새솔에너지",
  "푸른제약", "하늘항공", "바른금융", "솔빛소재", "온누리통신",
  "미르게임즈", "별빛엔터", "단비식품", "나래로보틱스", "초록건설",
  "해솔조선", "마루소프트", "라온모빌리티", "도담헬스케어", "아라해운",
  "은하배터리", "보람유통", "여울철강", "한결보험", "그린수소",
  "새벽디스플레이", "이룸증권", "다솜화장품", "벼리AI", "한울자동차",
];

/** 가격대가 골고루 섞이도록 기준가 후보를 둔다 (호가 단위 경계 테스트 겸용) */
const BASE_PRICES = [1_500, 4_000, 15_000, 40_000, 120_000, 350_000, 700_000];

/** 체결 : 호가 = 7 : 3 */
const TICK_RATIO = 0.7;
/** 가상 체결시간은 메시지 1건마다 10ms씩 흐른다 (seed가 같으면 시간 필드도 같도록) */
const VIRTUAL_MS_PER_MESSAGE = 10;
const MARKET_OPEN_SEC = 9 * 3600;
/** 상·하한가 ±30% */
const LIMIT_RATIO = 0.3;
/** 인기 종목 상위 5개가 메시지의 약 60% (spec 5.1) */
export const HOT_COUNT = 5;
const HOT_RATIO = 0.5; // 나머지 50%도 균등 선택이라 상위 5개에 일부 더 간다 → 합계 약 60%
/** multi 모드에서 체결 중 묶음으로 보내는 비율 */
const MULTI_RATIO = 0.3;

export type SymbolInfo = { code: string; name: string };

type SymbolState = { code: string; prevClose: number; price: number; accVol: number };

export function symbolCode(index: number): string {
  return `9${String(index + 1).padStart(5, "0")}`;
}

export function symbolName(code: string): string {
  const index = Number(code.slice(1)) - 1;
  return NAMES[index] ?? `가상종목${index + 1}`;
}

export function symbolList(count: number): SymbolInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const code = symbolCode(i);
    return { code, name: symbolName(code) };
  });
}

/** 시드 고정 난수 (mulberry32). Math.random()은 시드를 줄 수 없어 측정 재현이 안 된다 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MockGenerator = {
  symbols: SymbolInfo[];
  /** 접속 직후 화면을 채우기 위한 전 종목 체결 1건 + 호가 1건 */
  snapshot(): string[];
  /** 다음 메시지 1건 (KIS 원문 형식). multi: 일부 체결을 2~3건 묶음으로 보낸다 (burst 구간) */
  next(opts?: { multi?: boolean }): string;
};

export function createMockGenerator(options: { seed: number; symbols: number }): MockGenerator {
  const rng = createRng(options.seed);
  const pick = (n: number) => Math.floor(rng() * n);
  let messageIndex = 0;

  const states: SymbolState[] = symbolList(options.symbols).map(({ code }) => {
    const base = BASE_PRICES[pick(BASE_PRICES.length)] ?? 10_000;
    const prevClose = alignToTick(Math.round(base * (0.6 + rng() * 0.8)));
    return { code, prevClose, price: prevClose, accVol: 0 };
  });

  function virtualTime(): string {
    const sec = MARKET_OPEN_SEC + Math.floor((messageIndex * VIRTUAL_MS_PER_MESSAGE) / 1000);
    const hh = Math.floor(sec / 3600) % 24;
    const mm = Math.floor(sec / 60) % 60;
    const ss = sec % 60;
    return [hh, mm, ss].map((v) => String(v).padStart(2, "0")).join("");
  }

  function movePrice(s: SymbolState) {
    // 대부분 한 호가 이내로 움직이고, 가끔 2~3호가씩 튄다
    const r = rng();
    const steps = r < 0.05 ? 3 : r < 0.15 ? 2 : r < 0.7 ? 1 : 0;
    const up = rng() < 0.5;
    let price = s.price;
    for (let i = 0; i < steps; i++) price = up ? tickUp(price) : tickDown(price);
    const upper = s.prevClose * (1 + LIMIT_RATIO);
    const lower = s.prevClose * (1 - LIMIT_RATIO);
    if (price <= upper && price >= lower && price > 0) s.price = price;
  }

  /** 체결 레코드 1건의 필드 46개 */
  function tickFields(s: SymbolState): string[] {
    movePrice(s);
    const tradeVol = 1 + Math.floor(rng() ** 3 * 2_000);
    s.accVol += tradeVol;
    const change = s.price - s.prevClose;
    const sign = change > 0 ? "2" : change < 0 ? "5" : "3";
    const rate = ((change / s.prevClose) * 100).toFixed(2);

    const f = Array<string>(TICK_FIELD_COUNT).fill("0");
    f[TICK_FIELD.CODE] = s.code;
    f[TICK_FIELD.TIME] = virtualTime();
    f[TICK_FIELD.PRICE] = String(s.price);
    f[TICK_FIELD.SIGN] = sign;
    f[TICK_FIELD.CHANGE] = String(change);
    f[TICK_FIELD.RATE] = rate;
    f[TICK_FIELD.TRADE_VOL] = String(tradeVol);
    f[TICK_FIELD.ACC_VOL] = String(s.accVol);
    messageIndex++;
    return f;
  }

  function tickRaw(s: SymbolState): string {
    return `0|${TR_TICK}|001|${tickFields(s).join("^")}`;
  }

  /** 다건 체결: 레코드 여러 개를 ^로 이어 붙이고 데이터건수를 적는다 (KIS가 체결이 몰릴 때 보내는 형식) */
  function multiTickRaw(records: SymbolState[]): string {
    const count = String(records.length).padStart(3, "0");
    return `0|${TR_TICK}|${count}|${records.flatMap((s) => tickFields(s)).join("^")}`;
  }

  /** 인기 종목 쏠림: 메시지의 HOT_RATIO가 상위 HOT_COUNT 종목에 간다 (장 초반 재현) */
  function pickSymbol(): SymbolState {
    const hot = states.length > HOT_COUNT && rng() < HOT_RATIO;
    const s = hot ? states[pick(HOT_COUNT)] : states[pick(states.length)];
    if (!s) throw new Error("종목이 없음");
    return s;
  }

  function bookRaw(s: SymbolState): string {
    const asks: number[] = [];
    const bids: number[] = [];
    let ask = tickUp(s.price);
    let bid = s.price;
    for (let i = 0; i < BOOK_LEVELS; i++) {
      asks.push(ask);
      bids.push(bid);
      ask = tickUp(ask);
      bid = Math.max(1, tickDown(bid));
    }
    const qty = () => String(1 + Math.floor(rng() * rng() * 20_000));
    const f = [s.code, virtualTime(), "0", ...asks.map(String), ...bids.map(String)];
    for (let i = 0; i < BOOK_LEVELS * 2; i++) f.push(qty());
    // 43번 이후 필드는 실데이터 검증 전이라 생성하지 않는다 (spec 7.2)
    if (f.length !== BOOK_USED_FIELD_COUNT) throw new Error("호가 필드 수 불일치");
    messageIndex++;
    return `0|${TR_BOOK}|001|${f.join("^")}`;
  }

  return {
    symbols: symbolList(options.symbols),
    snapshot() {
      return states.flatMap((s) => [tickRaw(s), bookRaw(s)]);
    },
    next(opts = {}) {
      const isTick = rng() < TICK_RATIO;
      if (!isTick) return bookRaw(pickSymbol());
      if (opts.multi && rng() < MULTI_RATIO) {
        // 2~3건 묶음
        const n = 2 + pick(2);
        return multiTickRaw(Array.from({ length: n }, pickSymbol));
      }
      return tickRaw(pickSymbol());
    },
  };
}
