export interface LimbV2MessageBase {
  timestamp: string; // sender's local time
  nonce?: string; // can be used to match messages with responses
}

/**
 * Messages used to control server
 */
export interface ClientCommands extends Record<string, LimbV2MessageBase> {
  'room:join': LimbV2MessageBase & {room: string};
  'room:leave': LimbV2MessageBase & {room: string};
  'sys:ping': LimbV2MessageBase;
}

/**
 * Message originated from server
 */
export interface ServerCommands {
  'sys:welcome': {socketId: string};
  'sys:pong': LimbV2MessageBase;
}

/**
 * Messages forwarded between clients
 */
export interface ClientMessage extends LimbV2MessageBase {
  /**
   *
   */
  to?: (`room:${string}` | `socket:${string}`)[];
  /**
   * sender's Socket id (automatically added by server)
   */
  from?: string;
  /**
   * automatically added by server, if the message is forwarded via a room
   */
  viaRoom?: string;
}
