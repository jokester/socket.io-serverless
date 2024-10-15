import { createDebugLogger } from 'socket.io-serverless/dist/cf';
import type * as sio from 'socket.io/lib';

export const parentNamespace = /^\/v1\/[-\w:.]+$/;

const logger = createDebugLogger('socket.io-serverless:demo:app');

/**
 * An example socket.io server logic, forwarding all messages to all clients.
 * @param socket
 */
export function onConnection(socket: sio.Socket) {
  const namespace = socket.nsp;
  logger('connection', namespace.name, socket.id);

  socket.on('disconnecting', (reason: any) => {
    logger('disconnecting', namespace.name, socket.id, reason);
  });

  socket.on('disconnect', (reason: any) => {
    logger('disconnect', namespace.name, socket.id, reason);
  });

  socket.on('error', (error: any) => {
    logger('error', namespace.name, socket.id, error);
  });

  // forward "message" events to the same namespace. Clients should use `send(clientEventName, value)`
  socket.on('message', (event: string, value: any) => {
    logger('forwarding message', namespace.name, socket.id, event, value);
    namespace.send(event, value);
  });
}
