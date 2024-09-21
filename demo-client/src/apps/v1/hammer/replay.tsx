import {ReactElement, useMemo, useRef, useState} from 'react';
import {motion} from 'framer-motion';
import debug from 'debug';
import {SerializedHammerInput} from './remote-source';

const debugLogger = debug('limb:v1:hammer:replay');

const motionCircleProps = {
  fill: 'transparent',
  strokeWidth: 2,
  initial: {r: 0},
  animate: {r: 100},
  transition: {r: {delay: 0, duration: 3}},
} as const;

export interface UnifiedHammerInput extends SerializedHammerInput {
  latency: number; // computed at receiver side
}

export function transformLocalEvent(
  ev: SerializedHammerInput
): UnifiedHammerInput {
  return {...ev, latency: 0};
}

export function transformRemoteEvent(
  ev: SerializedHammerInput
): UnifiedHammerInput {
  const latency = Date.now() - Date.parse(ev.timestamp);
  return {...ev, latency};
}

export function useInputReplayElements(ownClientId: string) {
  const elementCount = useRef(0);

  const [elements, setElements] = useState<ReactElement[]>(() => []);

  const callbacks = useMemo(() => {
    return {
      onInput(ev: UnifiedHammerInput) {
        debugLogger('useInputReplayElements event', ev, ownClientId);
        const stroke = ev.clientId === ownClientId ? '#00ff00' : '#ff0000';
        if (ev.type === 'tap') {
          const e = (
            <motion.circle
              {...motionCircleProps}
              stroke={stroke}
              cx={ev.center.x}
              cy={ev.center.y}
              key={++elementCount.current}
              onAnimationComplete={() => removeElement(e)}
            />
          );

          setElements(prev => [...prev, e as ReactElement]);
        } else if (ev.type === 'doubletap') {
          const e = (
            <motion.circle
              {...motionCircleProps}
              stroke={stroke}
              cx={ev.center.x}
              cy={ev.center.y}
              strokeWidth={5}
              key={++elementCount.current}
              onAnimationComplete={() => removeElement(e)}
            />
          );

          setElements(prev => [...prev, e as ReactElement]);
        }
      },
    } as const;

    function removeElement(e: unknown) {
      setElements(prev => prev.filter(i => i !== e));
    }
  }, [ownClientId]);

  return {elements, callbacks} as const;
}
