import {clsx} from 'clsx';
import {useEffect, useState} from 'react';
import {useAsyncEffect} from '@jokester/ts-commonutil/lib/react/hook/use-async-effect';
import qrcode from 'qrcode';

export function QRCode({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useAsyncEffect(
    async running => {
      const url = await qrcode.toDataURL(value);
      if (running.current) {
        setSrc(url);
      }
    },
    [value]
  );
  return (
    src && (
      <img alt="qrcode" className={clsx('w-32 h-32', className)} src={src} />
    )
  );
}
