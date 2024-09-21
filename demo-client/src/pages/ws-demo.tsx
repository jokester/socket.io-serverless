import {useAsyncEffect} from '@jokester/ts-commonutil/lib/react/hook/use-async-effect';
import {wait} from '@jokester/ts-commonutil/lib/concurrency/timing';
import {PageProps} from './_shared';
import {ReactElement} from 'react';

const wsUrl = 'ws://localhost:18787/engine.io/';

function useWsDemo(url = wsUrl) {
  useAsyncEffect(async running => {
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(ws);
      ws.onmessage = msg => {
        console.log('got msg', msg);
      };
      ws.onclose = ev => console.log('closed', ev);
      ws.onerror = reject;
    });

    while (running.current && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({time: Date.now()}));
      await wait(1e3);
    }
  }, []);
}

export function WsDemoPage(props: PageProps) {
  useWsDemo();
  return 'TODO' as any as ReactElement;
}
