import { BatchedApp } from "@/components/BatchedApp";
import { NaiveApp } from "@/components/NaiveApp";
import { OptimizedApp } from "@/components/OptimizedApp";
import { PerfPanel } from "@/components/PerfPanel";
import { parseMockParams, parseMode, parseSource, toSearchParams } from "@/lib/query";

// 쿼리는 페이지 로드 시 한 번만 읽는다. 모드 전환은 URL을 바꿔 새로고침 (spec FR-5)
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = toSearchParams(await searchParams);
  const mode = parseMode(query.get("mode"));
  const source = parseSource(query.get("source"));
  const params = parseMockParams(query);

  return (
    <>
      {mode === "naive" && <NaiveApp source={source} params={params} />}
      {mode === "batched" && <BatchedApp source={source} params={params} />}
      {mode === "optimized" && <OptimizedApp source={source} params={params} />}
      {/* 측정 패널은 앱 트리 밖에 둔다 (앱 리렌더에 영향받지 않도록) */}
      <PerfPanel
        mode={mode}
        source={source}
        rate={source === "mock" ? params.rate : null}
        autoclick={query.get("autoclick") === "1"}
      />
    </>
  );
}
