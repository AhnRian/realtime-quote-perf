import { describe, expect, it } from "vitest";
import { RingBuffer } from "./ring-buffer";

describe("RingBuffer", () => {
  it("최신 항목이 앞에 온다", () => {
    const buf = new RingBuffer<number>(5);
    [1, 2, 3].forEach((n) => buf.push(n));
    expect(buf.toArrayNewestFirst()).toEqual([3, 2, 1]);
    expect(buf.size).toBe(3);
  });

  it("용량을 넘으면 가장 오래된 항목부터 버린다", () => {
    const buf = new RingBuffer<number>(50);
    for (let i = 0; i < 120; i++) buf.push(i);
    const items = buf.toArrayNewestFirst();
    expect(buf.size).toBe(50);
    expect(items).toHaveLength(50);
    expect(items[0]).toBe(119);
    expect(items.at(-1)).toBe(70);
  });

  it("용량 0은 허용하지 않는다", () => {
    expect(() => new RingBuffer(0)).toThrow();
  });
});
