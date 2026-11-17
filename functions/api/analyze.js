// Cloudflare Pages Function: proxy aman ke Claude API (API key tidak pernah sampai ke browser)
const J = { "content-type": "application/json" };
export async function onRequestPost({ request, env }) {
  if (request.headers.get("x-app-key") !== env.APP_PASSWORD)
    return new Response(JSON.stringify({ error: { message: "Kata sandi salah" } }), { status: 401, headers: J });
  const { system, content } = await request.json();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { ...J, "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: env.MODEL || "claude-sonnet-5-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  return new Response(await r.text(), { status: r.status, headers: J });
}
