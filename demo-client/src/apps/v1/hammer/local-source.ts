import Hammer from 'hammerjs';

import {map, Observable, tap} from 'rxjs';
import debug from 'debug';
import {serializeHammerInput, SerializedHammerInput} from './remote-source';
const logger = debug('hammerSource');

const hammerEvNames = [
  'tap',
  'doubletap',
  'pan',
  'swipe',
  'press',
  'pinch',
  'rotate',
] as const;

export function createHammerManager(
  elem: HTMLElement | SVGElement,
  enablePinchRotate = true
): HammerManager {
  const manager = new Hammer(elem);
  if (enablePinchRotate) {
    manager.get('pinch').set({enable: true});
    manager.get('rotate').set({enable: true});
  }
  manager.get('pan').set({direction: Hammer.DIRECTION_ALL});
  manager.get('swipe').set({direction: Hammer.DIRECTION_VERTICAL});
  logger('hammer manager created', manager, elem);
  return manager;
}

export function createHammerInput$<T extends HammerInput = HammerInput>(
  manager: HammerManager
): Observable<T> {
  return new Observable(subscriber => {
    function handler(ev: HammerInput) {
      logger('raw hammer event', ev);
      subscriber.next(ev as T);
    }
    manager.on(hammerEvNames.join(' '), handler);
    return () => {
      manager.off(hammerEvNames.join(' '), handler);
    };
  });
}

export function createLocalHammerInput$(
  manager: HammerManager,
  ownClientId: string,
  baseElem: HTMLElement | SVGElement
): Observable<SerializedHammerInput> {
  return createHammerInput$(manager).pipe(
    map(orig => serializeHammerInput(orig, ownClientId, baseElem)),
    tap(ev => logger('local hammer event', ev))
  );
}
