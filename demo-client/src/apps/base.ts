import {Observable} from 'rxjs';
import {io, Socket} from 'socket.io-client';

export function createConnection(socketUrl: string): Observable<Socket> {
  return new Observable(subscriber => {
    const socket = io(socketUrl);

    socket.on('connect', () => {
      subscriber.next(socket);
    });

    socket.on('disconnect', () => {
      subscriber.error(new Error('Socket connection closed'));
    });

    return () => {
      socket.close();
    };
  });
}

export function createEvent<Payload>(
  socket: Socket,
  event: string
): Observable<Payload> {
  return new Observable<Payload>(subscriber => {
    socket.on(event, (payload: Payload) => {
      subscriber.next(payload);
    });

    return () => {
      socket.off(event);
    };
  });
}
