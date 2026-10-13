import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getClientIp(req: Request): string | null {
  // Cloudflare supplies this header at the edge. Fall back to common proxy headers
  // for deployments where that header is not available.
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && cfIp.length <= 64) return cfIp;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 64) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first && first.length <= 64) return first;
  return null;
}

async function hmacIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSecret = Deno.env.get("LEAD_RATE_LIMIT_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !rateLimitSecret || rateLimitSecret.length < 32) {
    console.error("Contact form is not configured: required server secrets are missing.");
    return json(503, { error: "The contact form is temporarily unavailable. Please try again later." });
  }

  const ip = getClientIp(req);
  if (!ip) return json(503, { error: "Could not verify this request. Please try again later." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const name = typeof body.p_name === "string" ? body.p_name.trim() : "";
  const shop = typeof body.p_shop === "string" ? body.p_shop.trim() : "";
  const contact = typeof body.p_contact === "string" ? body.p_contact.trim() : "";
  const message = typeof body.p_message === "string" ? body.p_message.trim() : "";

  if (name.length < 2 || name.length > 80 || shop.length > 80 ||
      contact.length < 5 || contact.length > 120 || message.length > 1000) {
    return json(400, { error: "Please check the form fields and try again." });
  }

  const ipKey = await hmacIp(ip, rateLimitSecret);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("submit_lead", {
    p_name: name,
    p_shop: shop,
    p_contact: contact,
    p_message: message,
    p_ip_key: ipKey,
  });

  if (error) {
    console.error("submit_lead RPC failed:", error.message);
    return json(500, { error: "Sorry, that did not send. Please try again later." });
  }
  if (data !== true) {
    return json(429, { error: "Too many messages. Please wait before trying again." });
  }
  return json(200, { ok: true });
});
