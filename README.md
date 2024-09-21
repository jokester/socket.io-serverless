# socket.io-serverless

## Unsupported uses

- Defining parent namespace with a function
- Rooms

<!--
## Internals


```
In normal socket.io distribution

ws.WebSocket <=> eio.WebSocketTransport <=> eio.Socket <=> sio.Client <=> sio.Socket <=> sio.Namespace

---

in this build:

cf.WebSocket <=> EioTransport           <=> EioSocket  <=> EioSocketStub <=> SioClient <=> sio.Socket <=> sio.Namespace
```
-->
