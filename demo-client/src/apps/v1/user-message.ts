import type {Socket} from 'socket.io-client';
import {filter, fromEvent, map, Observable, pipe, tap} from 'rxjs';
import debug from 'debug';

const logger = debug('limb:v1:user-message');

/**
 * created to debug rxjs.fromEvent(), not used by now
 * @deprecated
 */
function fromMyEvent<T>(s: Socket, name: string): Observable<T> {
  return new Observable(subscriber => {
    logger('fromMyEvent subscribed', name);
    const handler = (...values: any[]) => {
      logger('fromMyEvent event', name, values);
      subscriber.next(values as any);
    };
    s.on(name, handler);
    return () => {
      s.off(name, handler);
      logger('fromMyEvent unsubscribed', name);
    };
  });
}

export function create$UserMessage<T extends object>(
  socket: Socket,
  name: string
) {
  const messages: Observable<[messageType: string, payload: T]> = fromEvent(
    socket,
    'message'
  );

  return messages.pipe(
    tap(ev => logger('create$UserMessage pipe in', ev)),
    filter(msg => msg[0] === name),
    map(msg => msg[1] as T),
    tap(ev => logger('create$UserMessage pipe out', ev))
  );
}
