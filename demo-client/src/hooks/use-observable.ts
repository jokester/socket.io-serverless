import {Observable} from 'rxjs';
import {useEffect, useState} from 'react';

import debug from 'debug';

const logger = debug('useObservable');

export function useObservable<T>(
  src: null | undefined | Observable<T>,
  defaultValue: T,
  errorValue = defaultValue
): T {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (!src) {
      setValue(defaultValue);
      return;
    }
    logger('useObservable subscribe', src);
    const sub = src.subscribe({
      next(value) {
        logger('useObservable next', value);
        setValue(value);
      },
      error(err) {
        console.error('useObservable error', err);
        setValue(errorValue);
      },
      complete() {
        console.info('useObservable complete');
      },
    });
    return () => sub.unsubscribe();
  }, [src]);
  return value;
}
