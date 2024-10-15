export const localDevOrigin = 'http://localhost:18787';
export const demoServerlessServerOrigin = 'https://sio-serverless-demo.ihate.work';
export const demoNodeServerOrigin = 'https://limb.jokester.io';

export function getSocketServerOrigin(l: Location): string {
  const isHttpsOrigin = l.protocol === 'https:';
  const forceRemoteServer = l.search.includes('remote=1');
  return (isHttpsOrigin || forceRemoteServer)
    ? demoServerlessServerOrigin
    : localDevOrigin;
}

export interface PageProps<M extends Record<string, string> = {}> {
  // e.g. /conn/:id
  path: string;

  // e.g. /conn/123
  url?: string;

  matches?: M;
}
