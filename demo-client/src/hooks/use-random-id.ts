import {useSingleton} from 'foxact/use-singleton';

export function useRandomId(prefix?: string, len = 8): string {
  return useSingleton(() =>
    [
      prefix ?? '',
      Math.random()
        .toString(36)
        .substring(2, 2 + len),
    ].join('')
  ).current;
}
