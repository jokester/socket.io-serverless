import {PageProps} from '../../_shared';
import {HammerTouchDemo} from '../../../apps/v1/hammer/demo';
import {useRandomId} from '../../../hooks/use-random-id';
import {useFps} from '@jokester/ts-commonutil/lib/react/hook/use-fps';
import {QRCode} from '../../../components/qrcode';

export function MultiDeviceGesturePage(props: PageProps<{namespace: string}>) {
  const ownId = useRandomId(undefined, 8);
  const fps = useFps(120);
  return (
    <div className="container mx-auto p-2 sm:p-0">
      <div className="flex justify-between">
        <p>namespace: {props.matches!.namespace}</p>
        <p>fps: {fps.toFixed(2)}</p>
      </div>
      <hr />
      <p>
        1.  tap or double-tap the gray plate, to see touch events from current device.
      </p>
      <p>
        2. copy URL of this page and open in other device, you can see touch events get forwarded between devices.
      </p>
      <HammerTouchDemo
        namespace={props.matches!.namespace}
        ownClientId={ownId}
      />
      <hr />
      <div>
        Open this page in other device:
        <QRCode className={'inline-block'} value={window.location.href} />
      </div>
    </div>
  );
}
