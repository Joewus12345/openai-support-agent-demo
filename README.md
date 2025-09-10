# Customer Support Agent with Human in the Loop Demo

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-NextJS-blue)
![OpenAI API](https://img.shields.io/badge/Powered_by-OpenAI_API-orange)

This repository contains a NextJS demo app of a Customer Service with a Human in the loop (HITL) use case built on top of the [Responses API](https://platform.openai.com/docs/api-reference/responses).
It leverages the [file search](https://platform.openai.com/docs/guides/tools-file-search) built-in tool and implements 2 views of a chat interface: one for the customer, and one for the human agent.

This demo is an example flow where a human agent would be assisted by an AI agent to answer customer questions, while staying in control of sensitive actions.

![screenshot](./public/screenshot.jpg)

Features:

- Multi-turn conversation handling
- File search tool
- Vector store creation & file upload for use with the file search
- Knowledge base display
- Function calling
- Streaming suggested responses
- Suggested actions to execute tool calls
- Auto-execution of tool calls for non-sensitive actions
- Optional auto reply mode to automatically send suggested messages
- Filters out irrelevant questions and jailbreaking attempts
- Idle sessions auto-close after 4 minutes, sending unsaved messages and marking the session as ended
- Works with either `openai` or `ollama` providers. The built-in tools operate
  the same with both.

Feel free to customize this demo to suit your specific use case.

## Project structure

- `app/` for Next.js routes & API handlers
- `components/` for UI components
- `stores/` for state management (e.g., `useConversationStore`)
- `scripts/` for maintenance tasks like `cleanupSessions.ts`
- `prisma/` for schema & migrations, etc.

## Docker Quickstart

Copy [`.env.ai`](./.env.ai), adjust credentials or port mappings, and add your `AGENT_TOKENS` mapping. This file is used when running the container.

The easiest way to run the entire stack with the baked-in port mappings is:

```bash
docker compose -f docker-compose.agent.yml up --build
```

The steps below show how to build and run each container manually.

1. **Build the image**

   ```bash
   docker build -t ai-agent .
   ```

2. **Create a network and start PostgreSQL and Redis on free ports**

   ```bash
   docker network create support-net
   docker run --rm -d --name demo-db --network support-net -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres
   docker run --rm -d --name demo-redis --network support-net -p 6380:6379 redis
   ```

3. **Run the AI agent**

   ```bash
   docker run --rm -p 3001:3001 --network support-net --env-file .env.ai \
     -e DATABASE_URL=postgresql://postgres:postgres@demo-db:5432/support_agent_demo \
     -e REDIS_URL=redis://demo-redis:6379 ai-agent
   ```

## Troubleshooting

- **`P1001: Can't reach database server`** – verify container names/ports and ensure the `support-net` network exists.
- **`P1000: Authentication failed`** – check the database credentials in [`.env.ai`](./.env.ai).
- **`network support-net not found`** – create the network first: `docker network create support-net`.
- **`port already allocated`** – choose unused host ports or stop conflicting services.

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment:**

   Create a `.env` file with your database connection string, Redis URL, session retention setting, and (optionally) Chatwoot credentials:

   ```bash
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<dbname>"
   REDIS_URL=redis://localhost:6379
   SESSION_RETENTION_DAYS=30 # How many days to retain ended sessions
   CHATWOOT_URL=https://e245e7cb03bc.ngrok-free.app
   CHATWOOT_APP_TOKEN=<chatwoot-app-token>
   CHATWOOT_BOT_TOKEN=<bot access token>
   AGENT_TOKENS='{"1":"agent-1-secret","2":"agent-2-secret"}'
  ```

When running this service inside Docker, copy the same `AGENT_TOKENS` mapping into `.env.ai`.

When running this service inside Docker, `CHATWOOT_URL` must be a fully
qualified address reachable from the container (for example, a public
ngrok or Cloudflare Tunnel URL) so that the agent can resolve the
Chatwoot instance.

If Redis runs on a dynamically mapped port (e.g. `docker port` or `docker compose port`), first determine the host port and then point `REDIS_URL` to it:

   ```bash
   docker compose port redis 6379
   # or: docker port <container_name> 6379
   # Suppose it prints 0.0.0.0:49153
   REDIS_URL=redis://localhost:49153
   ```

   `SESSION_RETENTION_DAYS` controls how long ended sessions are kept before cleanup (defaults to 30 days).
   Session messages cached in Redis are retained indefinitely until the session is cleaned up.
    The Chatwoot variables configure the webhook endpoints to send automated replies and handle status changes in your Chatwoot instance.
    Create two webhooks in Chatwoot:
    - `http://ai-agent:3001/api/chatwoot-webhook` subscribed only to `message_created`.
    - `http://ai-agent:3001/api/chatwoot-status-webhook` subscribed to `conversation_status_changed`, `conversation_updated`, and `message_created` (system events).

   The `AGENT_TOKENS` environment variable supplies per-agent access tokens in JSON form, e.g. `{ "1": "secret" }`. Store these secrets outside of source control (such as a `.env` file or your hosting platform's secret manager). To rotate a token, update the JSON with the new value and redeploy or restart the service so it reads the updated mapping.

   A standalone Docker setup is available to test the service in isolation:

   ```bash
   docker compose -f docker-compose.agent.yml up --build
   ```

   This starts the AI agent on `http://localhost:3001` along with PostgreSQL, Redis, and Ollama.

3. **Run database migrations:**

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. **Start Redis and the app:**

   Start a Redis server (e.g. `redis-server` or `docker run -p 6379:6379 redis`) and then run:

   ```bash
   npm run dev
   ```

5. **Ticket IDs in chats:**

   When a customer does not share an email, the `create_ticket` tool generates a ticket ID in the format `#<index>/<date>` (for example `#1/2024-05-01`). The ID is stored with the chat session so the conversation can be resumed later using that ticket number.

## Agent release workflow

Releases are triggered only when a conversation moves from `open` to either `pending` or `resolved` **and** still carries the `agent-assigned` label. The `chatwoot-status-webhook` checks for this combination before calling `releaseAgent`. Inside `releaseAgent`, the label is removed, which generates additional webhook events to handle follow-up processing.

## How to use

1. **Set up the OpenAI API:**

   - If you're new to the OpenAI API, [sign up for an account](https://platform.openai.com/signup).
   - Follow the [Quickstart](https://platform.openai.com/docs/quickstart) to retrieve your API key.

2. **Clone the Repository:**

   ```bash
   git clone https://github.com/openai/openai-support-agent-demo.git
   ```

3. **Set the OpenAI API key:**

   2 options:

   - Set the `OPENAI_API_KEY` environment variable [globally in your system](https://platform.openai.com/docs/libraries#create-and-export-an-api-key)
   - Set the `OPENAI_API_KEY` environment variable in the project: Create a `.env` file at the root of the project and add the following line (see `.env.example` for reference):

   ```bash
   OPENAI_API_KEY=<your_api_key>
   ```

   **Note:** File search uses the OpenAI vector store when the provider is set
   to `openai`. When using the `ollama` provider, search falls back to a local
   vector store built from the knowledge base using Ollama's `embeddings`
   endpoint. You can keep both stores initialized and switch providers at any
   time.

4. **Choose your provider (optional):**

   The assistant can run using the `openai` API, the `ollama` package, or
   Ollama's OpenAI compatible endpoint. You can switch providers from the
   dropdown next to **Auto reply** in the agent view. When selecting either
   `ollama` or `ollama-openai`, make sure you have an Ollama server running
   locally (e.g. by executing `ollama serve`). The built-in tools work the same
   with all providers.

## Running Ollama

When using the `ollama` provider you need a local server running.

1. Start the server:

   ```bash
   ollama serve
   ```

2. Begin with a lightweight model such as `llama3`:

   ```bash
   ollama run llama3
   ```

   The command downloads the model if needed. Use `ollama run <model>` or `ollama pull <model>` to get other models.

3. After installing multiple models, switch between them using the **Model** dropdown in the agent view. Ensure the provider dropdown is set to `ollama`.

4. (Optional) Configure the default model and context size by adding the following variables to your `.env` file (see `.env.example`):

   ```bash
   OLLAMA_MODEL=llama3.2
   OLLAMA_NUM_CTX=32768
   OLLAMA_HOST=http://localhost:11434
   ```

   To enable the OpenAI compatible endpoint, also set:

   ```bash
   OLLAMA_OPENAI_BASE_URL=http://localhost:11434/v1
   OLLAMA_OPENAI_API_KEY=ollama
   ```

5. **Install dependencies:**

   Run in the project root:

   ```bash
   npm install
   ```

   You must run this command before executing `npm run lint` or `npm run dev`.

6. **Run the app:**

   ```bash
   npm run dev
   ```

   The app will be available at [`http://localhost:3000`](http://localhost:3000).

7. **Initialize the vector store:**

   Visit [`/init_vs`](http://localhost:3000/init_vs) where you can create both
   OpenAI and Ollama vector stores.

   - **Initialize OpenAI vector store**: click the <kbd>OpenAI</kbd> button. Copy
     the returned vector store ID and paste it into
     `config/constants.ts` as `VECTOR_STORE_ID`.
  - **Initialize Ollama vector store**: click the <kbd>Ollama</kbd> button to
    generate embeddings locally. This stores the embeddings in the
    `data/local_vector_store.json` file.
  - **Rebuild Ollama vector store**: click the <kbd>Rebuild Ollama</kbd> button
    on the same page to regenerate embeddings after updating the knowledge base
    (this calls `/api/local_vector_store/init?force=true`).

   The OpenAI vector store will be used when the provider is set to `openai`
   while the local store powers file search when using the `ollama` provider.
   Both stores can exist side by side.

  By default, searches return up to 10 results. Local search applies a cosine
  similarity threshold of 0.3. Provide a `limit` option to control the number of results,
  a `threshold` option to adjust the cutoff, or set `topKOnly: true` to ignore
  the threshold and rely solely on the highest scoring `limit` matches.

## Demo Flow

To try out the demo, you can ask questions that will trigger a file search.

Example questions:

- What is the return policy?
- How do I return a product?
- How can I cancel an order?
- What does your company do?
- Do you sell sensors?

When an answer is generated, it will be displayed as a suggested response for the customer support representative.
In the agent view, you can edit the message or send it as is.
You can toggle **Auto reply** in the agent view to automatically send the suggested response.

You can also click on the "Relevant articles" to see the corresponding articles in the knowledge base or FAQ.

You can then continue the conversation as the user.

You can ask for help to trigger actions.

Example questions:

- Help me cancel order ORD1001 => Should suggest the `cancel_order` action
- Help me reset my password => Should suggest the `reset_password` action
- Give me a list of my past orders => Should trigger the execution of `get_order_history`

### End-to-end demo flow

1. Ask as the user "How can I cancel my order?"
2. Confirm the suggested response
3. Ask as the user "Help me cancel order ORD1001"
4. Confirm the suggested response
5. Confirm the suggested action to cancel the order
6. Confirm the suggested response

### Limitations

Note that the functions that are executed are just placeholders and are not actually modifying any data, so the actions will not have any effect. For example, calling `cancel_order` won't change the status of the order.

## Customization

To customize this demo you can:

- Edit prompts, initial message and model in `config/constants.ts`
- Edit available functions in `config/tools-list.ts`
- Edit functions logic in `config/functions.ts`
- (optional) Edit the demo data in `config/demoData.ts`

You can also customize the endpoints in the `/api` folder to call your own backend or external services.

If you want to use this code repository as a starting point for your own project in production, please note that this demo is not production-ready and that you would need to implement safety measures such as input guardrails, user authentication, etc.

## Local database

This demo can store customer profiles and chat sessions in a local PostgreSQL database using Prisma.

1. Add your connection string to `.env`:

   ```bash
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<dbname>"
   ```

2. Run the migrations to create the tables (including the latest schema updates):

   ```bash
   npx prisma migrate deploy
   ```

3. Start a Redis instance (for example, run `redis-server` locally or use Docker `docker run -p 6379:6379 redis`).

4. Configure Redis by setting `REDIS_URL` in your `.env` file:

   ```bash
   REDIS_URL=redis://localhost:6379
   ```

The new API endpoints under `/api/users` and `/api/sessions/start` allow the agent to create or retrieve customer records, manage chat sessions, and store conversation history using this database and Redis. During each turn, `/api/turn_response` persists messages via `saveSessionMessages`, so a separate `/api/sessions/[session_id]/save` call is no longer required.

## Session lifecycle & cleanup

- Sessions automatically end after 4 minutes of inactivity.
- Run `npm run cleanup:sessions` to remove ended sessions older than the number of days specified in `SESSION_RETENTION_DAYS`.
- By default, sessions are retained for 30 days. Change the value of `SESSION_RETENTION_DAYS` in your `.env` file to adjust the retention period.

### Session summarization & pruning

Sessions automatically summarize and prune older messages once the number of unsummarized messages exceeds the `MAX_UNSUMMARIZED_MESSAGES` limit (default 50). This keeps active sessions lightweight while preserving a running summary of prior context.

Set the `MAX_UNSUMMARIZED_MESSAGES` environment variable to control how many recent messages are kept verbatim.

To prune existing sessions to the current limit, run:

```bash
npm run prune:sessions
```

The pruning script also updates each user's `longSummary` retroactively. After a session's message log is reduced and its summary
is refreshed, that summary is itself summarized and appended to the user's existing long-term summary so historical context
is preserved.

## Contributing

You are welcome to open issues or submit PRs to improve this app, however, please note that we may not review all suggestions.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
