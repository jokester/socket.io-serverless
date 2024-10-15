import {memo, PropsWithChildren, useEffect, useRef, useState} from 'react';
import {createHammerManager, createLocalHammerInput$} from './local-source';
import {share} from 'rxjs';
import {io} from 'socket.io-client';
import {createRemoteHammerInput$, remoteEventName} from './remote-source';
import {getSocketServerOrigin} from '../../../pages/_shared';
import debug from 'debug';
import {
  transformLocalEvent,
  transformRemoteEvent,
  useInputReplayElements,
} from './replay';

const logger = debug('limb:v1:hammer:demo');

function _HammerTouchDemo({
  ownClientId,
  namespace,
}: PropsWithChildren<{namespace: string; ownClientId: string}>) {
  const touchableRef = useRef<SVGSVGElement>(null);

  const replayElements = useInputReplayElements(ownClientId);

  useEffect(() => {
    const defaultOrigin = getSocketServerOrigin(location);

    const socket = io(`${defaultOrigin}/v1/${namespace}`, {
      transports: ['websocket'],
    });
    for (const event of ['connect', 'disconnect', 'connect_error', 'message']) {
      socket.on(event, (...rest: unknown[]) => {
        logger('socket event', event, rest);
      });
    }
    const manager = createHammerManager(touchableRef.current!);

    const localInput$ = createLocalHammerInput$(
      manager,
      ownClientId,
      touchableRef.current!
    ).pipe(share());

    const remoteInput$ = createRemoteHammerInput$(socket, ownClientId);

    const forwardLocal = localInput$.subscribe(ev => {
      logger('forward local event', ev, socket.connected);
      if (socket.connected) {
        socket.send(remoteEventName, ev);
      }
    });

    const presentLocal = localInput$.subscribe(ev => {
      logger('present local event', ev, socket.connected);
      replayElements.callbacks.onInput(transformLocalEvent(ev));
    });

    const replayRemote = remoteInput$.subscribe(ev => {
      logger('replay remote event', ev);
      replayElements.callbacks.onInput(transformRemoteEvent(ev));
    });

    return () => {
      forwardLocal.unsubscribe();
      presentLocal.unsubscribe();
      replayRemote.unsubscribe();
      manager.destroy();
      socket.close();
    };
  }, [namespace, ownClientId, replayElements.callbacks]);

  // useObservable(unified$, null);

  logger('svgChildren', replayElements.elements);

  return (
    <div className="text-center py-2">
      <svg className="inline-block w-64 h-64 bg-gray-200" ref={touchableRef}>
        {replayElements.elements}
      </svg>
    </div>
  );
}

export const HammerTouchDemo = memo(_HammerTouchDemo, whatever => true);
