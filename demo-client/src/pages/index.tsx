import {useRandomId} from '../hooks/use-random-id';
import {PageProps} from './_shared';

function NamespaceV1Demo({namespace}: {namespace: string}) {
  return (
    <div className="my-2 pl-1">
      <h2>Namespace V1 demo:</h2>
      <div className="pl-1">
        <div>
          <a href={`/v1/multidevice-gesture/${namespace}`}>
            multi-device-gesture
          </a>
        </div>
        <div>
          <a href={`/v1/broadcast/${namespace}`}>simply broadcasting message</a>
        </div>
      </div>
    </div>
  );
}

export function IndexPage(props: PageProps) {
  const randomNamespaceV1 = useRandomId('limb-demo:namespace-v1:');

  return (
    <div>
      <h1>Limb: just a socket.io signaling server</h1>
      <p>It can be used to forward between peers</p>
      <NamespaceV1Demo namespace={randomNamespaceV1} />
      <hr />
    </div>
  );
}
