import {render} from 'preact';
import Router from 'preact-router';
import './app.scss';
import debug from 'debug';
import {NotFoundPage} from './pages/404';
import {IndexPage} from './pages';
import {V2RoomPage} from './pages/v2/:roomId';
import {MultiDeviceGesturePage} from './pages/v1/multidevice-gesture/:namespace';
import {BroadcastPage} from './pages/v1/broadcast/:namespace';
import { WsDemoPage } from './pages/ws-demo';

const logger = debug('app:main');

function RootRouter() {
  return (
    <Router>
      <IndexPage path="/" />
      <MultiDeviceGesturePage path="/v1/multidevice-gesture/:namespace+" />
      <BroadcastPage path="/v1/broadcast/:namespace+" />
      <V2RoomPage path="/v2/:roomId" />
      <WsDemoPage path='/ws-demo' />
      <NotFoundPage default />
    </Router>
  );
}
render(<RootRouter />, document.getElementById('app')!);

logger('app loaded');
