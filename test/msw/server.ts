import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const defaultHandlers = [
  http.post("https://api.vapi.ai/*", () =>
    HttpResponse.json({ stubbed: true, by: "msw", service: "vapi" }),
  ),
  http.get("https://api.vapi.ai/*", () =>
    HttpResponse.json({ stubbed: true, by: "msw", service: "vapi" }),
  ),

  http.post("https://api.fetch.tinyfish.ai/*", () =>
    HttpResponse.json({ stubbed: true, by: "msw", service: "tinyfish", results: [] }),
  ),
  http.get("https://api.search.tinyfish.ai/*", () =>
    HttpResponse.json({ stubbed: true, by: "msw", service: "tinyfish", results: [] }),
  ),

  http.post("https://api.anthropic.com/v1/messages", () =>
    HttpResponse.json({
      id: "msg_stub",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "stubbed response from msw" }],
      model: "claude-stub",
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  ),
];

export const server = setupServer(...defaultHandlers);
