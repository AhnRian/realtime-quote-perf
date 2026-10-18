import { mkdirSync, writeFileSync } from "node:fs";
import { KIS_SYMBOLS } from "../src/lib/kis-symbols";
import { applyEvent, EMPTY_MARKET, TRADE_LIMIT } from "../src/lib/market-state";
import { createMockGenerator, symbolList, type SymbolInfo } from "../src/lib/mock-generator";
import { parseRaw } from "../src/lib/parser";
import type { MarketEvent, NewsItem, StockDetail } from "../src/lib/types";

// SSR 종목 상세용 고정 데이터 생성 (spec 6.2). 결과는 fixtures/stock-details.json으로 커밋한다.
// 실행: pnpm fixtures

const NEWS_TOPICS = [
  "3분기 실적 발표, 시장 예상치 상회",
  "신규 설비 투자 계획 공시",
  "외국인 순매수 5거래일 연속",
  "목표주가 상향 조정",
  "해외 수주 소식에 장 초반 강세",
  "자사주 매입 결정",
  "업황 둔화 우려에 약세",
  "신제품 출시 일정 공개",
  "대표이사 기자간담회 개최",
  "배당 정책 변경 검토",
];
const NEWS_SOURCES = ["가상경제", "모의일보", "테스트뉴스", "샘플투데이"];
const BASE_TIME = Date.UTC(2026, 9, 16, 6, 30); // 2026-10-16 15:30 KST

function buildDetails(symbols: SymbolInfo[], seed: number, codeMap: (mockCode: string) => string) {
  const generator = createMockGenerator({ seed, symbols: symbols.length });
  const raws = [...generator.snapshot(), ...Array.from({ length: symbols.length * 120 }, () => generator.next())];
  let state = EMPTY_MARKET;
  for (const raw of raws) {
    for (const event of parseRaw(raw, BASE_TIME) ?? []) state = applyEvent(state, remap(event, codeMap));
  }

  const details: Record<string, StockDetail> = {};
  symbols.forEach((symbol, i) => {
    const quote = state.quotes[symbol.code];
    const book = state.books[symbol.code];
    if (!quote || !book) throw new Error(`데이터 부족: ${symbol.code}`);
    const news: NewsItem[] = Array.from({ length: 20 }, (_, n) => ({
      id: i * 100 + n,
      title: `${symbol.name}, ${NEWS_TOPICS[(i + n) % NEWS_TOPICS.length]}`,
      source: NEWS_SOURCES[n % NEWS_SOURCES.length] ?? "가상경제",
      publishedAt: new Date(BASE_TIME - n * 37 * 60_000).toISOString(),
    }));
    details[symbol.code] = {
      code: symbol.code,
      name: symbol.name,
      quote,
      book,
      trades: (state.trades[symbol.code] ?? []).slice(0, TRADE_LIMIT),
      news,
    };
  });
  return details;
}

function remap(event: MarketEvent, codeMap: (code: string) => string): MarketEvent {
  return event.type === "tick"
    ? { type: "tick", tick: { ...event.tick, code: codeMap(event.tick.code) } }
    : { type: "book", book: { ...event.book, code: codeMap(event.book.code) } };
}

const mockSymbols = symbolList(30);
const mockDetails = buildDetails(mockSymbols, 42, (code) => code);

// KIS 종목은 가상 가격으로 채우고 코드만 실제 종목 코드로 바꾼다
const kisCodeByMock = new Map(symbolList(KIS_SYMBOLS.length).map((s, i) => [s.code, KIS_SYMBOLS[i]?.code ?? s.code]));
const kisDetails = buildDetails(
  symbolList(KIS_SYMBOLS.length).map((s, i) => ({ code: kisCodeByMock.get(s.code) ?? s.code, name: KIS_SYMBOLS[i]?.name ?? s.name })),
  7,
  (code) => kisCodeByMock.get(code) ?? code,
);

mkdirSync("fixtures", { recursive: true });
const out = { ...mockDetails, ...kisDetails };
writeFileSync("fixtures/stock-details.json", `${JSON.stringify(out)}\n`);
console.log(`fixtures/stock-details.json: ${Object.keys(out).length}종목`);
