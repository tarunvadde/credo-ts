---
'@credo-ts/didcomm': patch
---

Close the WebSocket to the mediator when message pickup or live mode setup fails, so the mediation recipient reconnects instead of staying on a socket where live mode is not enabled. Custom outbound transports can implement the new optional `closeSocketByConnectionId(connectionId)` method to get the same recovery.
