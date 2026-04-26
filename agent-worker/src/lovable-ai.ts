const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string; tool_calls?: any[] };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: any } };

export async function chat(opts: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
}): Promise<{ message: any; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tools ? "auto" : undefined,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json() as any;
  return { message: json.choices?.[0]?.message, usage: json.usage ?? null };
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const model = process.env.EMBEDDING_MODEL ?? "google/text-embedding-004";
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  return json.data?.[0]?.embedding ?? [];
}
