import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OrderBookView } from "@/components/OrderBookView";
import { TradeList } from "@/components/TradeList";
import { changeColor, formatChange, formatInt, formatRate } from "@/lib/format";
import { getStockDetail } from "@/server/data/stock-detail";

// SSR 종목 상세 (spec 6.1). 서버에서 데이터를 받아 HTML로 렌더하므로 처음부터 내용이 보인다.
// connection(): 빌드 시 미리 렌더하거나 캐시하지 않고 요청마다 렌더한다 (SSR 부하 측정 대상)

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  const detail = await getStockDetail(code);
  if (!detail) notFound();

  const { quote, book, trades, news } = detail;
  const color = changeColor(quote.change);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="text-xs text-neutral-400 hover:underline">
        ← 실시간 시세
      </Link>
      <header className="mt-2 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <span className="text-neutral-500">{detail.code}</span>
        <span className={`text-2xl ${color}`}>{formatInt(quote.price)}</span>
        <span className={color}>
          {formatChange(quote.change)} ({formatRate(quote.rate)})
        </span>
        <span className="text-neutral-400 text-xs">거래량 {formatInt(quote.accVol)}</span>
      </header>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section>
          <h2 className="mb-1 text-xs text-neutral-400">호가</h2>
          <OrderBookView book={book} lastPrice={quote.price} />
        </section>
        <section>
          <h2 className="mb-1 text-xs text-neutral-400">최근 체결</h2>
          <TradeList trades={trades} />
        </section>
        <section>
          <h2 className="mb-1 text-xs text-neutral-400">관련 뉴스</h2>
          <ul className="space-y-1 text-xs">
            {news.map((n) => (
              <li key={n.id} className="border-b border-neutral-900 pb-1">
                <div>{n.title}</div>
                <div className="text-neutral-500">
                  {n.source} · {n.publishedAt.slice(0, 16).replace("T", " ")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
