# Fieldnote API

REST routes start at `/api`. In the browser, use the frontend origin so the host-only session cookie travels with the request. Direct API clients should retain the cookie from signup or login and send a configured `Origin` header on every state-changing request. Bodies use JSON unless specified otherwise. Responses are marked `no-store`.

| Method and path | Request | Success |
| --- | --- | --- |
| `GET /health` | Public | `200` with `{ status: "ok" }`, or `503` when the database is unavailable |
| `POST /auth/signup` | `{ name, email, password }` | `201` with `{ user }` and a session cookie |
| `POST /auth/login` | `{ email, password }` | `200` with `{ user }` and a session cookie |
| `POST /auth/logout` | Session cookie, no body | `204`. Revokes the session and disconnects its sockets |
| `GET /me` | Session cookie | `200` with `{ user }` |
| `PATCH /me/settings` | `{ assistantName, theme }` | `200` with the updated `{ user }`. Themes are `system`, `light`, and `dark` |
| `GET /socket-token` | Session cookie | `200` with a two-minute `{ token }` for the socket handshake |
| `GET /conversations` | Optional `limit` and `before` | `200` with `{ items, nextCursor }`, newest activity first |
| `POST /conversations` | `{ category }` | `201` with a conversation. Categories are `casual`, `professional`, and `creative` |
| `GET /conversations/:id` | Optional `limit` and `before` | `200` with `{ conversation, items, nextCursor }`. Turns in each page are oldest first |
| `POST /messages` | `{ conversationId, requestId, text }` | `200` with the completed turn, `202` for an existing pending request, or `502` with a failed turn that can be retried |
| `PATCH /messages/:id/feedback` | `{ rating, feedback }` | `200` with the updated turn. Rating is `1`, `-1`, or `null`. Feedback is optional and limited to 500 characters |
| `GET /admin/analytics` | Admin session. `days` may be `7`, `30`, or `90` | `200` with totals, daily message counts, and recent written feedback |

Use `nextCursor` unchanged as `before` to fetch another page. `limit` defaults to 40 and accepts 1–100. All account-specific operations use the authenticated owner. Validation, expired sessions, missing records, and quotas yield `400`, `401`, `404`, and `429` respectively. Most errors return `{ error }`. The API returns `403` for restricted origins and administrator access, and `409` for conflicting submissions.

## Real-time chat

Connect Socket.IO using the backend URL, WebSocket transport, and `auth: { token }`. The handshake requires a configured frontend `Origin`. Obtain a fresh token for each connection attempt. The socket and REST routes use the same persistence and generation logic.

| Direction | Event | Payload |
| --- | --- | --- |
| Client to server | `chat:send` | `{ conversationId, requestId, text }` with acknowledgement. The acknowledgement contains `{ turn }` or `{ error, status }` |
| Server to account sessions | `conversation:update` | Conversation metadata, including `id`, `title`, `category`, and `updatedAt` |
| Server to account sessions | `turn:update` | Turn with `status: pending`, `complete`, or `failed` |
| Server to account sessions | `turn:delta` | `{ conversationId, requestId, answer }` with the cumulative answer to date |

Generate a UUID for each user message. Reuse it and the same text when retrying a failed turn. Duplicate submissions retrieve the existing record, and two model calls cannot run simultaneously for the same conversation. After reconnecting, refresh conversation data to recover events missed while disconnected.

A turn stores the submitted text, answer, status, feedback, and timestamps. The provider receives the current message, the category and assistant name, and up to ten preceding complete turns under a character budget. The web client renders formatted replies with Markdown and treats model output as untrusted text.
