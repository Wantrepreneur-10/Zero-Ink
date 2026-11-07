// Zero Ink AI — Supabase Edge Function.
// Modes: ping | parse (order text → line items) | menu_scan (photo → menu) | ask (Q&A over receipts) | summary (dashboard insights)
// Needs secret ANTHROPIC_API_KEY. Without it every mode returns { ai: false } and the app uses its built-in rules.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODELS = [Deno.env.get('AI_MODEL') || 'claude-haiku-5-5', 'claude-haiku-4-5'];

async function claude(key: string, system: string, content: unknown, max = 800) {
  let last = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: max, system, messages: [{ role: 'user', content }] }),
    });
    if (r.ok) {
      const d = await r.json();
      return (d.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    }
    last = `${r.status} ${await r.text()}`;
    if (r.status !== 404 && r.status !== 400) break;
  }
  throw new Error(last);
}

function pullJson(t: string) {
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  return m ? JSON.parse(m[0]) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (body.mode === 'ping') return json({ ai: !!key });
  if (!key) return json({ ai: false });
  try {
    if (body.mode === 'parse') {
      const menu = (body.menu || []).slice(0, 300).map((m: any) => `${m.name} | ${m.price}`).join('\n');
      const t = await claude(key,
        'You turn a cashier\'s spoken or typed order into line items. Match each item to the closest menu entry (handle typos, plurals, slang, numbers as words). Return ONLY JSON: {"items":[{"name":string,"qty":number,"price":number}],"unmatched":[string]}. Use menu prices. If an item is not on the menu but a price is stated, include it with that price. Otherwise put it in unmatched.',
        `MENU (name | price):\n${menu}\n\nORDER: ${String(body.text || '').slice(0, 1000)}`, 600);
      return json({ ai: true, ...(pullJson(t) || { items: [], unmatched: [] }) });
    }
    if (body.mode === 'menu_scan') {
      const t = await claude(key,
        'Read this restaurant menu photo. Return ONLY JSON: {"items":[{"name":string,"price":number,"category":string}]}. Skip items with no readable price. Max 150 items.',
        [{ type: 'image', source: { type: 'base64', media_type: body.media_type || 'image/jpeg', data: body.image } },
         { type: 'text', text: 'Extract the menu items.' }], 4000);
      return json({ ai: true, ...(pullJson(t) || { items: [] }) });
    }
    if (body.mode === 'ask') {
      const rows = (body.receipts || []).slice(0, 400)
        .map((r: any) => `${r.date} | ${r.store} | ${r.category || ''} | $${r.amount} | ${r.items || ''}`).join('\n');
      const t = await claude(key,
        `You answer questions about the user's own receipts. Be brief (1-3 sentences), specific, and use only the data. Give dollar totals to 2 decimals. Today is ${body.today}. If the data cannot answer, say so.`,
        `RECEIPTS (date | store | category | amount | items):\n${rows || '(none)'}\n\nQUESTION: ${String(body.question || '').slice(0, 500)}`, 400);
      return json({ ai: true, answer: t.trim() });
    }
    if (body.mode === 'summary') {
      const t = await claude(key,
        'You are a sharp, friendly restaurant analyst. Given today\'s numbers, write 3 short bullet insights (each under 20 words) the owner can act on. Plain text bullets starting with "• ". No fluff, no invented numbers.',
        JSON.stringify(body.stats || {}).slice(0, 6000), 300);
      return json({ ai: true, summary: t.trim() });
    }
    return json({ error: 'unknown mode' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ai: false, error: String(e).slice(0, 300) });
  }
});
