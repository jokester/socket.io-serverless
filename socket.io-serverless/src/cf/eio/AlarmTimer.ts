import type * as CF from '@cloudflare/workers-types';
import { lazyThenable } from '@jokester/ts-commonutil/lib/concurrency/lazy-thenable';
import { ResourcePool } from '@jokester/ts-commonutil/lib/concurrency/resource-pool';
import { PACKET_TYPES } from 'engine.io-parser/lib/commons';
import debugModule from 'debug';

const debugLogger = debugModule('sio-serverless:eio:AlarmTimer');

interface AlarmState {
  nextAlarm?: number | null;
}

const ENCODED_PING = PACKET_TYPES['ping'];

/**
 * Alarm timer logic
 *
 * When there is at least 1 connection, the alarm timer fires at least {@name pingInterval} ms
 */
export class AlarmTimer {
  /**
   * a concurrent access proofing, lazy inited state
   */
  private _state = ResourcePool.single(lazyThenable(async () => {
    debugLogger('AlarmTimer#_state init');
    return ({
      nextAlarm: await this.actorCtx.storage.getAlarm(),
    } as AlarmState);
  }));

  constructor(private readonly actorCtx: CF.DurableObjectState, readonly pingInterval: number) {
  }

  onAlarm(wokenAt: number, websockets: CF.WebSocket[]): Promise<void> {
    debugLogger('onAlarm');
    return this._state.use(async (stateP) => {
      const state = await stateP;
      debugLogger('onAlarm', state);

      if (websockets.length) {
        await this.actorCtx.storage.setAlarm(wokenAt + this.pingInterval);
        state.nextAlarm = wokenAt + this.pingInterval;
        debugLogger('AlarmTimer#onAlarm() scheduled next alarm at', state.nextAlarm);
      } else {
        state.nextAlarm = null;
        debugLogger('AlarmTimer#onAlarm() next alarm not scheduled');
        // if no connection, no need to schedule next alarm
      }

      for (const w of websockets) {
        try {
          w.send(ENCODED_PING);
          // NOT using auto response pair:
          // assuming client will send pong before current DO enters hibernation again, so not waking the DO.
        } catch (e) {
          console.error('AlarmTimer#onAlarm() error send engine.io PING', e);
        }
      }
      if (Date.now() > wokenAt + this.pingInterval / 10) {
        console.warn(
          'AlarmTimer#onAlarm(): Unexpectedly slow sending ping to engine.io clients. Maybe too many connections.',
        );
      }
    });
  }

  onNewConnection(): Promise<void> {
    debugLogger('onNewConn');
    return this._state.use(async (stateP) => {
      const state = await stateP;
      debugLogger('onNewConn', state);
      const nextAlarm = Date.now() + this.pingInterval;
      if (
        !(
          state.nextAlarm &&
          Date.now() < state.nextAlarm &&
          state.nextAlarm < nextAlarm
        )
      ) {
        await this.actorCtx.storage.setAlarm(nextAlarm);
        state.nextAlarm = nextAlarm;
        debugLogger('AlarmTimer#onNewConn() scheduled next alarm at', state.nextAlarm);
      } else {
        // not overwriting the next alarm scheduled earlier than nextAlarm
      }
    });
  }
}
