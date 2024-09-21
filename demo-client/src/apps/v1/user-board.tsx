import {Observable, of, scan, tap} from 'rxjs';
import {useMemo} from 'react';
import type {Socket} from 'socket.io-client';
import debug from 'debug';
import {useObservable} from '../../hooks/use-observable';
import {create$UserMessage} from './user-message';

const logger = debug('limb:v1:apps:userBoard');

interface UserEntry {
  clientId: string;
  firstSeen: Date;
  lastSeen: Date;
  latency: number;
}

export function create$RecentUser(conn?: Socket): Observable<UserEntry[]> {
  if (!conn) {
    return of([
      {
        clientId: 'no-conn',
        firstSeen: new Date(),
        lastSeen: new Date(),
        latency: 0,
      },
    ]);
  }

  const $pings = create$UserMessage<{clientId: string; timestamp: string}>(
    conn,
    'ping'
  );

  return $pings.pipe(
    scan((acc: UserEntry[], ping: {clientId: string; timestamp: string}) => {
      const prevIndex = acc.findIndex(e => e.clientId === ping.clientId);
      if (prevIndex >= 0) {
        // user exists
        return acc.map((existed, i) => {
          if (i === prevIndex) {
            return {
              ...existed,
              lastSeen: new Date(ping.timestamp),
              latency: Date.now() - Date.parse(ping.timestamp),
            };
          } else {
            return existed;
          }
        });
      } else {
        // new user
        return [
          {
            clientId: ping.clientId,
            firstSeen: new Date(ping.timestamp),
            lastSeen: new Date(ping.timestamp),
            latency: Date.now() - Date.parse(ping.timestamp),
          },
          ...acc,
        ];
      }
    }, []),
    tap(ev => logger('user entries', ev))
  );
}

/**
 * A component to show recent-saw users in a limb v1 namespace.
 */
export function UserBoard({conn}: {conn?: Socket}) {
  const $userBoard = useMemo(() => create$RecentUser(conn), [conn]);
  const entries = useObservable($userBoard, []);

  return (
    <div className="px-2 py-2">
      Recent users:
      {entries.map(e => (
        <div className="pl-1" key={e.clientId}>
          {e.clientId}:
          <span>
            {e.lastSeen.toISOString()} ~ {e.firstSeen.toISOString()}
          </span>
          <span className="ml-1">latency = {e.latency.toFixed(2)} ms</span>
        </div>
      ))}
    </div>
  );
}
