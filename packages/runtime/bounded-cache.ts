export class BoundedCache<T> {
  private values = new Map<string, { value: T; bytes: number; touched: number }>();
  private bytes = 0;
  constructor(private maxItems: number, private maxBytes: number, private ttl: number, private clock = Date.now) {}
  set(key: string, value: T) {
    this.delete(key); this.sweep();
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > this.maxBytes) return false;
    this.values.set(key, { value, bytes, touched: this.clock() }); this.bytes += bytes;
    while (this.values.size > this.maxItems || this.bytes > this.maxBytes) this.delete(this.values.keys().next().value!);
    return true;
  }
  get(key: string) {
    const entry = this.values.get(key); if (!entry) return undefined;
    if (this.clock() - entry.touched > this.ttl) { this.delete(key); return undefined; }
    this.values.delete(key); entry.touched = this.clock(); this.values.set(key, entry); return entry.value;
  }
  delete(key: string) { const entry = this.values.get(key); if (entry) this.bytes -= entry.bytes; this.values.delete(key); }
  sweep() { for (const [key, entry] of this.values) if (this.clock() - entry.touched > this.ttl) this.delete(key); }
  clear() { this.values.clear(); this.bytes = 0; }
  get size() { this.sweep(); return this.values.size; }
}
