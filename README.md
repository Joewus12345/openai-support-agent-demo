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
- Works with either `openai` or `ollama` providers. The built-in tools operate
  the same with both.

Feel free to customize this demo to suit your specific use case.

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

   **Note:** Even when using the `ollama` provider, the `search_files` function
   queries the OpenAI vector store. Make sure your `OPENAI_API_KEY` is set so
   this call succeeds.

4. **Choose your provider (optional):**

   The assistant can run using either the `openai` API or the `ollama` package.
   You can switch providers from the dropdown next to **Auto reply** in the
   agent view. When selecting `ollama`, make sure you have an Ollama server
   running locally (e.g. by executing `ollama serve`). The built-in tools work
   the same with both providers.

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


5. **Install dependencies:**

   Run in the project root:

   ```bash
   npm install
   ```

6. **Run the app:**

   ```bash
   npm run dev
   ```

   The app will be available at [`http://localhost:3000`](http://localhost:3000).

7. **Initialize the vector store:**

   Go to [`/init_vs`](http://localhost:3000/init_vs) to create a vector store and initialize it with the knowledge base. Once you have created the vector store, update `config/constants.ts` with your own vector store ID.

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

   ```
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<dbname>"
   ```

2. Run the migrations to create the tables:

   ```bash
   npx prisma migrate deploy
   ```

The new API endpoints under `/api/users` and `/api/sessions/start` allow the agent to create or retrieve customer records and chat sessions using this database.

## Contributing

You are welcome to open issues or submit PRs to improve this app, however, please note that we may not review all suggestions.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
