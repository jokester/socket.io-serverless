export function lazy<T extends {}>(
  create: () => T
): {
  get value(): T;
} {
  let created: T | null = null;
  return {
    get value() {
      return (created ??= create());
    },
  };
}