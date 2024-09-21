export class LazyWeakMap<K extends object, V> {
  private readonly _map = new WeakMap<K, V>();

  constructor(private readonly _factory: (key: K) => V) {}

  get(key: K): V {
    if (!this._map.has(key)) {
      this._map.set(key, this._factory(key));
    }
    return this._map.get(key)!;
  }
}
