export class Random {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumExclusive: number): number {
    return Math.floor(this.range(minimum, maximumExclusive));
  }
}
