"use client";

import { useEffect, useState } from "react";
import {
  startMeasure,
  startVitalsReporting,
  subscribePerf,
  type LiveStats,
  type MeasureState,
} from "@/lib/perf-recorder";
import type { DataSource, RenderMode } from "@/lib/types";

// 측정 패널 오버레이. 앱 컴포넌트 트리 밖(page.tsx의 형제)에 두어
// naive 모드의 리렌더에 같이 끌려가 측정값을 왜곡하지 않도록 한다.

type Props = { mode: RenderMode; source: DataSource; rate: number | null };

export function PerfPanel({ mode, source, rate }: Props) {
  const [live, setLive] = useState<LiveStats | null>(null);
  const [measure, setMeasure] = useState<MeasureState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(
    () =>
      subscribePerf((nextLive, nextMeasure) => {
        setLive(nextLive);
        setMeasure(nextMeasure);
      }),
    [],
  );

  // 브라우저 지표를 Grafana로 보내기 위해 /api/vitals에 주기적으로 전송
  useEffect(() => startVitalsReporting(mode), [mode]);

  const resultJson = measure.status === "done" ? JSON.stringify(measure.result) : null;

  const copy = async () => {
    if (!resultJson) return;
    await navigator.clipboard.writeText(resultJson);
    setCopied(true);
  };

  return (
    <div className="fixed right-3 bottom-3 z-10 w-72 rounded border border-neutral-700 bg-black/90 p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold">측정 패널</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <Stat label="FPS" value={live?.fps} />
        <Stat label="행 렌더/s" value={live?.renders} />
        <Stat label="수신/s" value={live?.messages} />
        <Stat label="Long Task/s" value={live ? `${live.longTasks} (${live.longTaskMs}ms)` : undefined} />
        <Stat label="지연 p50" value={live ? `${live.p50}ms` : undefined} />
        <Stat label="지연 p95" value={live ? `${live.p95}ms` : undefined} />
      </dl>
      <button
        type="button"
        disabled={measure.status === "running"}
        onClick={() => {
          setCopied(false);
          startMeasure(mode, source, rate);
          setMeasure({ status: "running", remainingSec: 30 });
        }}
        className="mt-3 w-full rounded bg-neutral-700 py-1 hover:bg-neutral-600 disabled:opacity-50"
      >
        {measure.status === "running" ? `측정 중… ${measure.remainingSec}s` : "30초 측정"}
      </button>
      {resultJson && (
        <div className="mt-2">
          <pre data-testid="measure-result" className="break-all whitespace-pre-wrap text-neutral-300">
            {resultJson}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="mt-1 w-full rounded bg-blue-800 py-1 hover:bg-blue-700"
          >
            {copied ? "복사됨" : "JSON 복사"}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="text-right">{value ?? "-"}</dd>
    </>
  );
}
