import {Socket} from 'socket.io-client';
import {filter, Observable} from 'rxjs';
import {create$UserMessage} from '../user-message';
export interface SerializedHammerInput extends Pick<HammerInput, 'type'> {
  eventType: 'start' | 'move' | 'end' | 'cancel' | 'unknown';
  clientId: string;
  timestamp: string;
  elementSize: {width: number; height: number};
  center: {x: number; y: number};
}

export const remoteEventName = 'hammerInput';

export function createRemoteHammerInput$(
  s: Socket,
  ownClientId: string
): Observable<SerializedHammerInput> {
  const removeInput$ = create$UserMessage<SerializedHammerInput>(
    s,
    remoteEventName
  );
  return removeInput$.pipe(filter(ev => ev.clientId !== ownClientId));
}

const eventTypeMapping = {
  [Hammer.INPUT_START]: 'start',
  [Hammer.INPUT_MOVE]: 'move',
  [Hammer.INPUT_END]: 'end',
  [Hammer.INPUT_CANCEL]: 'cancel',
} as const;

export function serializeHammerInput(
  orig: HammerInput,
  clientId: string,
  baseElem: Element
): SerializedHammerInput {
  const bounding = baseElem.getBoundingClientRect();
  return {
    type: orig.type,
    eventType: eventTypeMapping[orig.eventType] ?? 'unknown',
    clientId,
    timestamp: new Date().toISOString(),
    elementSize: {width: bounding.width, height: bounding.height},
    center: {x: orig.center.x - bounding.x, y: orig.center.y - bounding.y},
  };
}
