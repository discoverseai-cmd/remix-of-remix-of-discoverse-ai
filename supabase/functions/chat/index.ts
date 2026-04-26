import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type IncomingMessage = {
  role: "user" | "agent" | "system";
  content: string;
  attachments?: Array<{ name: string; mime: string; dataUrl: string | null }>;
};

const SYSTEM_PROMPT =
  "You are Discoverse — an autonomous, helpful AI agent. Be concise, direct, and useful. Use markdown when it improves readability. When the user attaches files (especially images), inspect them and reference what you see.";

function toOpenAIMessage(m: IncomingMessage) {
  const role = m.role === "agent" ? "assistant" : m.role;
  const images = (m.attachments ?? []).filter(
    (a) => a.mime?.startsWith("image/") && a.dataUrl,
  );
  if (role === "user" && images.length > 0) {
    const parts: any[] = [];
    if (m.content) parts.push({ type: "text", text: m.content });
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
    }
    const nonImage = (m.attachments ?? []).filter(
      (a) => !a.mime?.startsWith("image/"),
    );
    if (nonImage.length) {
      parts.push({
        type: "text",
        text: `\n\n[Attached files: ${nonImage.map((a) => a.name).join(", ")}]`,
      });
    }
    return { role, content: parts };
  }
  let content = m.content;
  const names = (m.attachments ?? []).map((a) => a.name);
  if (names.length && role === "user") {
    content += `\n\n[Attached files: ${names.join(", ")}]`;
  }
  return { role, content };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, model } = (await req.json()) as {
      messages: IncomingMessage[];
      model?: string;
    };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map(toOpenAIMessage),
        ],
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (upstream.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const txt = await upstream.text();
      console.error("AI gateway error:", upstream.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});