import type { SymbolInfo } from "./mock-generator";

// KIS 실시간 구독 종목 (코스피 시가총액 상위 위주).
// 구독 제한(세션당 41건) 때문에 체결+호가 2건 × 20종목 = 40건으로 맞춘다 (spec 12장).
export const KIS_SYMBOLS: SymbolInfo[] = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "373220", name: "LG에너지솔루션" },
  { code: "207940", name: "삼성바이오로직스" },
  { code: "005380", name: "현대차" },
  { code: "000270", name: "기아" },
  { code: "068270", name: "셀트리온" },
  { code: "005490", name: "POSCO홀딩스" },
  { code: "035420", name: "NAVER" },
  { code: "035720", name: "카카오" },
  { code: "051910", name: "LG화학" },
  { code: "006400", name: "삼성SDI" },
  { code: "105560", name: "KB금융" },
  { code: "055550", name: "신한지주" },
  { code: "012330", name: "현대모비스" },
  { code: "028260", name: "삼성물산" },
  { code: "066570", name: "LG전자" },
  { code: "003550", name: "LG" },
  { code: "034730", name: "SK" },
  { code: "015760", name: "한국전력" },
];
