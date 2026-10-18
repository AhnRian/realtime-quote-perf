"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { changeColor, formatInt } from "@/lib/format";
import { getLastMessageAt } from "@/lib/market-socket";
import { STALE_MS, SubmitGuard, checkPrice, createOrderKey, isStale } from "@/lib/order";
import { clickStart, measureOrderOpened } from "@/lib/order-timing";

// 매수 버튼 + 주문 확인 패널 (spec 5.3). 실제 주문 API는 호출하지 않는다.
// "열림" 상태는 부모가 가진다: naive·batched는 페이지 state, optimized는 이 컴포넌트를 감싼 작은 컴포넌트.
// 그래서 주문 반응 시간에 모드별 렌더링 방식의 차이가 그대로 드러난다.

export type OrderOpen = { t0: number } | null;

/** 매수 버튼 클릭 → 반응 시간 측정 시작 시각(T0)을 함께 넘긴다 */
export function BuyButton({ onOpen }: { onOpen: (t0: number) => void }) {
  return (
    <button
      type="button"
      data-order-buy
      onClick={(e: MouseEvent) => onOpen(clickStart(e.nativeEvent))}
      className="rounded bg-red-700 px-3 py-0.5 text-xs font-semibold hover:bg-red-600"
    >
      매수
    </button>
  );
}

type DialogProps = {
  code: string;
  name: string;
  /** 지금 화면에 반영된 최신가 */
  latestPrice: number | undefined;
  t0: number;
  onClose: () => void;
};

const SIMULATED_RESPONSE_MS = 800;

/** 열릴 때마다 새로 마운트된다 (부모가 key로 t0를 준다) */
export function OrderDialog({ code, name, latestPrice, t0, onClose }: DialogProps) {
  // 패널을 연 순간의 가격 = 주문가. 확인 단계에서 최신가와 비교한다
  const [orderPrice] = useState(latestPrice);
  const [stale, setStale] = useState(() => isStale(getLastMessageAt(), Date.now()));
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "pending"; key: string } | { kind: "done"; key: string }>({
    kind: "idle",
  });
  const guard = useRef(new SubmitGuard());

  // 주문 반응 시간: 이 패널이 커밋된 직후 다음 프레임까지 (spec 5.4)
  useLayoutEffect(() => {
    measureOrderOpened(t0);
  }, [t0]);

  // 열려 있는 동안 0.5초마다 시세 지연 여부 확인
  useEffect(() => {
    const id = setInterval(() => setStale(isStale(getLastMessageAt(), Date.now())), 500);
    return () => clearInterval(id);
  }, []);

  const submit = () => {
    // disabled는 리렌더 후에 반영되므로, 같은 프레임의 연속 클릭은 여기서 막는다
    if (!guard.current.tryBegin()) return;
    const key = createOrderKey();
    setStatus({ kind: "pending", key });
    // 모의 주문: 실제 API 호출 없음. 응답이 없을 때 자동 재시도하지 않는다 (같은 주문이 두 번 나갈 수 있으므로)
    setTimeout(() => {
      guard.current.end();
      setStatus({ kind: "done", key });
    }, SIMULATED_RESPONSE_MS);
  };

  const price = checkPrice(orderPrice ?? 0, latestPrice ?? 0);

  return (
    <div
      role="dialog"
      aria-label="주문 확인"
      className="fixed top-16 left-1/2 z-20 w-80 -translate-x-1/2 rounded border border-neutral-600 bg-neutral-900 p-4 text-sm shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">
          매수 확인 · {name} <span className="text-xs text-neutral-500">{code}</span>
        </h2>
        <button type="button" data-order-close onClick={onClose} className="text-neutral-400 hover:text-white">
          ✕
        </button>
      </div>
      {stale && (
        <p role="alert" className="mb-2 rounded bg-yellow-900/60 px-2 py-1 text-xs text-yellow-200">
          ⚠ 가격 지연: {STALE_MS / 1000}초 이상 시세가 들어오지 않았습니다. 표시된 가격이 실제와 다를 수 있습니다.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-neutral-400">주문가 (패널 열 때)</dt>
        <dd className="text-right">{orderPrice !== undefined ? formatInt(orderPrice) : "-"}</dd>
        <dt className="text-neutral-400">최신가</dt>
        <dd className={`text-right ${price.changed ? changeColor(price.diff) : ""}`}>
          {latestPrice !== undefined ? formatInt(latestPrice) : "-"}
          {price.changed && ` (${price.diff > 0 ? "+" : ""}${formatInt(price.diff)})`}
        </dd>
        <dt className="text-neutral-400">수량</dt>
        <dd className="text-right">10주</dd>
      </dl>
      {price.changed && <p className="mt-2 text-xs text-neutral-300">가격이 바뀌었습니다. 최신가를 확인하세요.</p>}
      <button
        type="button"
        data-order-submit
        disabled={status.kind === "pending"}
        onClick={submit}
        className="mt-3 w-full rounded bg-red-700 py-1.5 font-semibold hover:bg-red-600 disabled:opacity-50"
      >
        {status.kind === "pending" ? "주문 중…" : "매수 주문"}
      </button>
      {status.kind !== "idle" && (
        <p className="mt-2 break-all text-xs text-neutral-400">
          주문 키 {status.key.slice(0, 8)}… {status.kind === "done" ? "· 접수됨 (모의)" : "· 처리 중"}
          <br />
          응답이 없으면 재시도하지 않고 주문 조회로 확인합니다.
        </p>
      )}
    </div>
  );
}
