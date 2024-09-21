import type * as net from 'node:net';
import type * as http from 'node:http';
import debug from 'debug';
import sio from 'socket.io';

const logger = debug('limb:server-utils');

export function waitSignal(name: string): Promise<string> {
  return new Promise(resolve => {
    process.on(name, () => resolve(name));
  });
}

/**
 * record alive TCP connections, to force disconnect them during shutdown
 * (socket.io may have problem close all connections.)
 * @return a function to close all TCP sockets
 */
export function prepareTcpConnect(server: http.Server): () => void {
  const sockets = new Set<net.Socket>();
  server.on('connection', conn => {
    sockets.add(conn);
    conn.on('close', () => {
      sockets.delete(conn);
    });
  });

  return () => sockets.forEach(s => s.destroy());
}

export function closeSioSockets(server: sio.Server) {
  for (const [nsName, namespace] of server._nsps) {
    for (const [socketId, socket] of namespace.sockets) {
      logger('force closing socket.io socket');
      socket.disconnect(true);
    }
  }
}
