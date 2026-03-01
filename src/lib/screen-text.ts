/**
 * Server-side extraction of on-screen text from a game frame using a vision API.
 * Used so step responses can include screenText (dialogue, menus, battle text).
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const PROMPT = `You are looking at a single frame from a Game Boy game (Pokémon Red). Extract ALL text visible on screen in reading order. Include:
- Dialogue or speech
- Menu labels and options
- Battle text (move names, "What will X do?", HP, etc.)
- Any other on-screen text

Return ONLY the raw text, one line per line of text on screen. No commentary or explanation. If there is no text, return an empty string.`;

export async function extractScreenTextFromImage(imageBuffer: Buffer): Promise<string> {
  if (!OPENAI_API_KEY?.trim()) {
    return "";
  }
  try {
    const base64 = imageBuffer.toString("base64");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[screen-text] OpenAI vision error:", res.status, err);
      return "";
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return text;
  } catch (e) {
    console.error("[screen-text] extractScreenText failed:", e);
    return "";
  }
}
