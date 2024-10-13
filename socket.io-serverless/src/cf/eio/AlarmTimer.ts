import type * as CF from '@cloudflare/workers-types';
import { lazyThenable } from '@jokester/ts-commonutil/lib/concurrency/lazy-thenable';

export class AlarmTimer {
  constructor(private readonly actorCtx: CF.DurableObjectState, readonly desiredInterval: number) {}

  async ensureAlarmScheduled(): Promise<boolean> {
    const prevSet = await this.actorCtx.storage.getAlarm();
    if ((prevSet ?? Number.MAX_SAFE_INTEGER) >= Date.now() + this.desiredInterval) {
      await this.actorCtx.storage.setAlarm(Date.now() + this.desiredInterval);
      return true;
    }
    return false;
  }

  readonly ensureOne = lazyThenable(() => this.ensureAlarmScheduled());

  async refresh(timerStart?: number) {
    await this.actorCtx.storage.setAlarm((timerStart ?? Date.now()) + this.desiredInterval);
  }
}
