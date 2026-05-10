# Native Bridge Contract (PWA + Swift Wrapper)

This document defines the JavaScript-to-native bridge contract used by the web app.

## Goal

Keep the PWA behavior unchanged in browsers while allowing a Swift host (WKWebView) to intercept selected capabilities for a native app feel.

## JavaScript API

Global object exposed by the app:

- window.platformBridge

Methods currently implemented:

- isNativeHost() -> boolean
- hasHandler(name) -> boolean
- emit(eventName, payload) -> boolean
- callNativeWithAck(handlerName, payload, options) -> Promise<{ sent, ok, requestId, ... }>
- resolveNativeResponse(response) -> boolean
- rejectNativeResponse(requestId, error) -> boolean
- requestNotificationPermission() -> Promise<boolean>
- showNotification(title, options) -> Promise<boolean>
- registerServiceWorker(swPath) -> Promise<boolean>
- openExternal(url) -> Promise<boolean>

## Native Handler Names

If a Swift wrapper provides these WKScriptMessageHandler names, JavaScript will call them:

- appEvent
- requestNotificationPermission
- showNotification
- registerServiceWorker
- openExternal

If a handler is not present, browser fallback behavior remains active.

## Async Callback Convention

JavaScript now sends request envelopes with response metadata for handlers that need acknowledgment:

{
  "requestId": "req:abc123",
  "expectsResponse": true,
  "ts": 1234567890,
  "...": "handler-specific payload"
}

Native host should call back into the web view using one of:

- window.platformBridge.resolveNativeResponse({...})
- window.__timescapeBridgeResolve({...})

Success response shape:

{
  "requestId": "req:abc123",
  "ok": true,
  "status": "granted",
  "value": { "optional": "payload" }
}

Failure response shape:

{
  "requestId": "req:abc123",
  "ok": false,
  "status": "denied",
  "error": "Reason text"
}

Timeout behavior:

- If native does not respond before timeout, bridge resolves using `defaultOkOnTimeout` (currently true for notification/service-worker/open-external flows to preserve backward behavior).

## Message Payload Schemas

appEvent:

{
  "event": "view:show",
  "payload": { "view": "calendar" },
  "ts": 1234567890
}

requestNotificationPermission:

{
  "requestId": "req:...",
  "expectsResponse": true,
  "ts": 1234567890
}

showNotification:

{
  "requestId": "req:...",
  "expectsResponse": true,
  "ts": 1234567890,
  "title": "Reminder",
  "options": {
    "body": "...",
    "tag": "...",
    "icon": "/icon-192.png",
    "data": { "url": "index.html#calendar" },
    "renotify": false
  }
}

registerServiceWorker:

{
  "requestId": "req:...",
  "expectsResponse": true,
  "ts": 1234567890,
  "path": "./sw.js"
}

openExternal:

{
  "requestId": "req:...",
  "expectsResponse": true,
  "ts": 1234567890,
  "url": "https://example.com"
}

## Current Integration Points

- Notifications scheduler uses platformBridge for permission and show notification.
- Push client uses platformBridge for service worker registration.
- App view routing emits appEvent on view changes.
- Storage access is routed through window.appStorage (assets/storage-adapter.js) with localStorage fallback behavior.

## Next Steps

1. Add host->web callback conventions for async completion status.
2. Add optional native-backed appStorage implementation in Swift host when desktop-only storage behavior is needed.
3. Add a small bridge diagnostics panel in settings to show host availability and handler support.
