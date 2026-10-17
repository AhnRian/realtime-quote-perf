// 고정 크기 링 버퍼. 가득 차면 가장 오래된 항목을 덮어쓴다.
// 체결 리스트를 매번 [새 체결, ...이전].slice(0, 50)로 복사하지 않기 위해 쓴다.

export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  /** 다음에 쓸 위치 */
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (capacity < 1) throw new Error("capacity는 1 이상");
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** 최신 항목이 앞에 오는 배열 */
  toArrayNewestFirst(): T[] {
    const result: T[] = [];
    for (let i = 1; i <= this.count; i++) {
      const item = this.items[(this.head - i + this.capacity) % this.capacity];
      if (item !== undefined) result.push(item);
    }
    return result;
  }
}
