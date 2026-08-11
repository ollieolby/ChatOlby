import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function ownConversation(userId: string, id: string) {
  const { data } = await admin.from("conversations").select("id, title, visitor_name, created_at").eq("id", id).eq("user_id", userId).single();
  return data;
}

async function notifyOperator(conversationId: string, username: string, message: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const operatorEmail = Deno.env.get("OPERATOR_EMAIL")?.toLowerCase();
  const { data: subscriptions } = await admin.from("push_subscriptions").select("endpoint, operator_id, p256dh, auth");
  const payload = JSON.stringify({ title: "New private chat message", body: "Open your inbox to read and reply.", conversationId });
  await Promise.allSettled((subscriptions || []).map(async subscription => {
    try {
      const { data: { user: subscribedOperator } } = await admin.auth.admin.getUserById(subscription.operator_id);
      if (!subscribedOperator || subscribedOperator.email?.toLowerCase() !== operatorEmail) {
        await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        return;
      }
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      else console.error("Push delivery failed", status);
    }
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const input = await req.json();
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "Please sign in" }, 401);
    const isOperator = user.email?.toLowerCase() === Deno.env.get("OPERATOR_EMAIL")?.toLowerCase();

    if (input.action === "user-conversations") {
      const { data, error } = await admin.from("conversations").select("id, title, created_at, updated_at, messages(body, created_at)").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ conversations: data.map((c: any) => ({ ...c, last_message: [...c.messages].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]?.body?.slice(0,80), messages: undefined })) });
    }
    if (input.action === "user-new") {
      let { data: profile } = await admin.from("profiles").select("username").eq("user_id", user.id).single();
      if (!profile) {
        const storedUsername = String(user.user_metadata?.username || "").trim();
        if (!/^[A-Za-z0-9_]{3,24}$/.test(storedUsername)) return json({ error: "Your account has no valid username. Please register again or contact the operator." }, 409);
        const { data: repaired, error: repairError } = await admin.from("profiles").insert({ user_id: user.id, username: storedUsername }).select("username").single();
        if (repairError?.code === "23505") return json({ error: "That username is already in use. Please contact the operator." }, 409);
        if (repairError) throw repairError;
        profile = repaired;
      }
      const { data, error } = await admin.from("conversations").insert({ user_id: user.id, visitor_name: profile.username }).select("id, title, created_at").single();
      if (error) throw error; return json({ conversation: data });
    }
    if (input.action === "user-thread") {
      const conversation = await ownConversation(user.id, input.conversationId);
      if (!conversation) return json({ error: "Chat not found" }, 404);
      const { data, error } = await admin.from("messages").select("*").eq("conversation_id", conversation.id).order("created_at");
      if (error) throw error; return json({ conversation, messages: data });
    }
    if (input.action === "user-message") {
      const conversation = await ownConversation(user.id, input.conversationId);
      if (!conversation) return json({ error: "Chat not found" }, 404);
      const body = String(input.body || "").trim(); if (!body || body.length > 2000) return json({ error: "Invalid message" }, 400);
      const { data, error } = await admin.from("messages").insert({ conversation_id: conversation.id, sender: "visitor", body }).select().single();
      if (error) throw error;
      const updates: Record<string,string> = { updated_at: new Date().toISOString() };
      if (conversation.title === "Chat with Ollie") updates.title = body.slice(0, 45);
      await admin.from("conversations").update(updates).eq("id", conversation.id);
      EdgeRuntime.waitUntil(
        notifyOperator(conversation.id, conversation.visitor_name || "a visitor", body)
          .catch(pushError => console.error("Push notification setup failed", pushError)),
      );
      return json({ message: data });
    }

    if (!isOperator) return json({ error: "Not authorised" }, 403);
    if (input.action === "operator-subscribe") {
      const subscription = input.subscription;
      if (!subscription?.endpoint?.startsWith("https://") || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json({ error: "Invalid push subscription" }, 400);
      const { error } = await admin.from("push_subscriptions").upsert({ endpoint: subscription.endpoint, operator_id: user.id, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updated_at: new Date().toISOString() });
      if (error) throw error; return json({ subscribed: true });
    }
    if (input.action === "operator-unsubscribe") {
      const endpoint = String(input.endpoint || "");
      if (!endpoint.startsWith("https://")) return json({ error: "Invalid push subscription" }, 400);
      const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("operator_id", user.id);
      if (error) throw error; return json({ subscribed: false });
    }
    if (input.action === "operator-list") {
      const { data, error } = await admin.from("conversations").select("id, title, visitor_name, created_at, updated_at, messages(body, created_at)").order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ conversations: data.map((c: any) => ({ ...c, last_message: [...c.messages].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]?.body?.slice(0,80), messages: undefined })) });
    }
    if (input.action === "operator-thread") {
      const { data: conversation, error: ce } = await admin.from("conversations").select("id, title, visitor_name, created_at").eq("id", input.conversationId).single();
      const { data: messages, error: me } = await admin.from("messages").select("*").eq("conversation_id", input.conversationId).order("created_at");
      if (ce || me) throw ce || me; return json({ conversation, messages });
    }
    if (input.action === "operator-reply") {
      const kind = input.kind === "image" ? "image" : "text"; const body = String(input.body || "");
      if (!body || body.length > 500000) return json({ error: "Invalid reply" }, 400);
      if (kind === "image" && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body)) return json({ error: "Invalid drawing" }, 400);
      const { data: target } = await admin.from("conversations").select("id").eq("id", input.conversationId).single();
      if (!target) return json({ error: "Chat not found" }, 404);
      const { data, error } = await admin.from("messages").insert({ conversation_id: input.conversationId, sender: "operator", kind, body }).select().single();
      if (error) throw error; await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId); return json({ message: data });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) { console.error(error); return json({ error: "Server error" }, 500); }
});
