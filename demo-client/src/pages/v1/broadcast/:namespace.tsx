import debug from 'debug';
import {useEffect, useState} from 'react';
import {io, Socket} from 'socket.io-client';
import {useSingleton} from 'foxact/use-singleton';
import {UserBoard} from '../../../apps/v1/user-board';
import {PageProps} from '../../_shared';
import {useRandomId} from '../../../hooks/use-random-id';

const logger = debug('app:v1:demoPage');

interface PageState {
  selfId: string;
  state: string;
  conn?: Socket;
  logLines: string[];
}

function usePageState(namespace: string): PageState {
  const selfId = useRandomId();

  const [state, setState] = useState<PageState>(() => ({
    selfId,
    state: 'init',
    logLines: [],
  }));

  interface PingMessage {
    clientId: string;
    timestamp: string;
  }

  useEffect(() => {
    let sioOrigin
    if (location.href.includes('remote=1')) {
      sioOrigin = 'https://limb.jokester.io'
    } else {
      sioOrigin = 'http://localhost:18787'
    }
    const socket = io(`${sioOrigin}/v1/${namespace}`, {
      transports: ['websocket'],
    });
    setState(prev => ({...prev, conn: socket}));

    for (const event of ['connect', 'disconnect', 'connect_error']) {
      socket.on(event, (...rest: unknown[]) => {
        logger('socket event', event, rest);
        const now = new Date().toISOString();

        setState(prev => ({
          ...prev,
          state: event,
          logLines: [`${now}: ${event}`, ...prev.logLines].slice(0, 100),
        }));
      });
    }

    socket.onAny((event, clientEvent, payload) => {
      logger('wildcard event', event, clientEvent, payload);
      const now = new Date().toISOString();
      if (clientEvent === 'ping') {
        const ping = payload as PingMessage;
        const delay = (Date.now() - Date.parse(ping.timestamp)).toFixed(2);

        setState(prev => ({
          ...prev,
          logLines: [
            `${now}: received ping from ${ping.clientId}, delay=${delay} ms`,
            ...prev.logLines,
          ].slice(0, 100),
        }));
      } else {
        logger('unhandled event', event, clientEvent, payload);
      }
    });

    const timer = setInterval(() => {
      const now = new Date().toISOString();

      if (socket.connected) {
        socket.volatile.send('ping', {
          clientId: selfId,
          timestamp: new Date().toISOString(),
        } as PingMessage);
        setState(prev => ({
          ...prev,
          logLines: [`${now}: sent ping as ${selfId}`, ...prev.logLines].slice(
            0,
            100
          ),
        }));
      } else {
        setState(prev => ({
          ...prev,
          logLines: [`${now}: unable to sent ping`, ...prev.logLines].slice(
            0,
            100
          ),
        }));
      }
    },
        // 2e3, //
        15e3, // causes SioActor to hibernate
        );

    return () => {
      clearInterval(timer);
      socket.close();
    };
  }, [namespace]);

  return state;
}

export function BroadcastPage(props: PageProps<{namespace: string}>) {
  logger('V1RoomPage', props);
  const namespace = useSingleton(() => props.matches!.namespace).current;
  const {selfId, state, logLines, conn} = usePageState(namespace);

  return (
    <div>
      <div>namespace: {namespace}</div>
      <div>own client id: {selfId}</div>
      <div>connection state: {state}</div>
      <div>
        <UserBoard conn={conn} />
      </div>
      <hr />
      <div className="h-64 overflow-y">
        {logLines.map(l => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}
