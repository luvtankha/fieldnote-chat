# Fieldnote Chat

Fieldnote is a responsive AI chat workspace with live replies, private conversation history, and a dashboard for administrators. It uses Next.js and Tailwind CSS for the frontend, Node.js and Express for the API, Socket.IO for WebSocket streaming, and Mongoose for MongoDB. The AI provider uses the OpenAI Chat Completions interface.

## Start locally

Use Node.js 24 and npm. Run the commands from this repository’s root.

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Generate a JWT secret with `node -p "require('node:crypto').randomBytes(32).toString('hex')"` and put it in `JWT_SECRET`.
3. Supply an `OPENAI_API_KEY`, or use a local OpenAI-compatible provider. For example, run `ollama pull qwen2.5:1.5b`, then set `AI_BASE_URL=http://127.0.0.1:11434/v1` and `AI_MODEL=qwen2.5:1.5b` in `.env`. Leave the OpenAI key blank for this Ollama configuration. [Ollama model](https://ollama.com/library/qwen2.5:1.5b)
4. In a separate terminal, start MongoDB with `npm run local:db` or `docker compose up -d mongo`. The local Node setup downloads the official MongoDB binary on first use and keeps data under `%LOCALAPPDATA%/Fieldnote/mongodb` on Windows or `~/.local/share/fieldnote/mongodb` on Linux/macOS. `FIELDNOTE_LOCAL_DB_DIR` overrides that location. You can also set `MONGODB_URI` to an existing database.
5. Run `npm run dev` and open [the local workspace](http://127.0.0.1:3000). Create an account and send a message.

For a local Next.js production build, run `npm run build`, `npm start -w backend`, and, in a second terminal, `npm start -w frontend`. For custom frontend hostnames or backend ports, copy `frontend/.env.example` to `frontend/.env.local` and update both the backend’s `APP_ORIGINS` and the frontend’s URLs before building.

## Application features

| Feature | Behavior |
| --- | --- |
| Accounts | Sign up, sign in, and sign out. Passwords use scrypt. The web JWT uses an HttpOnly cookie, with sessions backed and revocable in MongoDB. |
| Chat | Pick Casual, Professional, or Creative. Send with Enter, add a line with Shift+Enter, and watch the assistant reply through Socket.IO. The app can submit through REST during a socket outage. |
| History | Open previous conversations, page back through older messages, and continue with recent conversation context. Failed replies can be retried from the original message. |
| Personalization | Set the assistant’s name and choose System, Light, or Dark appearance. Rate replies and add written feedback. |
| Analytics | Admins can view active users, conversation counts, successful and failed replies, uncached response latency, cache hits, ratings, and recent written feedback over 7, 30, or 90 days. |

To grant analytics access, sign up with an account you control, then run `npm run admin -w backend -- account@example.com` with the correct `MONGODB_URI`. Sign in again to see **Analytics**. Pass `user` after the email to remove the role. Administrators see the feedback users submit and aggregate usage metrics.

## Verify

| Command | Coverage |
| --- | --- |
| `npm run build` | Next.js production compilation and page generation. |
| `npm test` | Real MongoDB integration with a controlled AI fixture, including account isolation, JWT sessions, request validation, WebSocket deltas, deduplication, caching, pagination, retries, rate limits, feedback, and analytics. |
| `npx playwright install chromium firefox webkit` then `npm run test:e2e` | Desktop Chromium and Firefox and an iPhone-size WebKit emulation. Tests cover signup, live chat, feedback, theme, sign-out, sign-in, and retained history. |
| `node scripts/test-server.mjs` then run the included collection in Postman | Exercises the REST flow against isolated MongoDB and a test AI fixture. |

To run the Postman suite with a real model, start `scripts/test-server.mjs` with an `OPENAI_API_KEY` and `AI_MODEL`, or with an `AI_BASE_URL` and `AI_MODEL`. The fixture database is isolated and temporary in both cases. [API reference](docs/API.md) · [Postman collection](docs/Fieldnote.postman_collection.json)

## Deploy from GitHub

1. Push the repository to GitHub. The included Actions workflow runs the build and tests on pushes and pull requests.
2. Create a MongoDB Atlas cluster and a database user scoped to `fieldnote`. Give the Render service network access using its outbound addresses and keep the connection string as a secret. [MongoDB Atlas setup](https://www.mongodb.com/docs/atlas/cli/current/atlas-cli-quickstart/) · [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/) · [Render outbound addresses](https://render.com/docs/outbound-ip-addresses)
3. Import the GitHub repository into Vercel as a Next.js project with root directory `frontend`. Reserve the production URL so it can be added to the backend’s `APP_ORIGINS`. [Vercel monorepo setup](https://vercel.com/docs/monorepos)
4. Create a Render Blueprint from the same repository. Set `MONGODB_URI`, `OPENAI_API_KEY`, and `APP_ORIGINS` in Render. `APP_ORIGINS` is a comma-separated list of exact HTTPS origins, such as `https://your-project.vercel.app`. Render generates `JWT_SECRET` and supplies the service port. `AI_MODEL`, `CHAT_USER_LIMIT`, and `CHAT_GLOBAL_LIMIT` can be adjusted in the backend environment. [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [WebSockets on Render](https://render.com/docs/websocket)
5. In Vercel, set `BACKEND_URL` and `NEXT_PUBLIC_SOCKET_URL` to the HTTPS URL of the Render service and deploy. The browser calls REST through the Vercel origin and opens the WebSocket directly to Render. [Vercel environment variables](https://vercel.com/docs/environment-variables)
6. Verify the Render `/api/health` endpoint, then sign up on the deployed frontend, wait for **Live**, and send a message. Reload, reopen the conversation, and check that the reply is still there. Assign the first admin role using the command above from a machine allowed to reach Atlas.

The backend is designed for a single Render instance. Reply caches are scoped to one user and one complete prompt context, with a ten-minute lifetime. Generation quotas and session records live in MongoDB. A multi-instance deployment would also need a shared Socket.IO adapter and shared authentication throttling.

## Roadmap

- Add explicit translation controls and test supported locales. The assistant currently attempts to reply in the language of the input.
- Add opt-in speech input and playback, including permission-denied behavior and accessible fallbacks.
- Add calendar integration with user authorization and confirmation for event changes.
- Evaluate a task-specific model using an approved dataset before adding any fine-tuning pipeline.
- Review ratings and written feedback in Analytics to guide iteration.
