import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(
    JSON.stringify({
      error: "Business setup AI now runs on Cloudflare Workers AI. Refresh TWIGA and try again.",
      code: "MOVED_TO_CLOUDFLARE_WORKERS_AI",
    }),
    { status: 410, headers: cors },
  );
});
