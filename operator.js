const config = window.CHAT_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const functionUrl = `${config.supabaseUrl}/functions/v1/chat`;
const loginView = document.querySelector("#loginView"), inboxView = document.querySelector("#inboxView");
const listEl = document.querySelector("#conversationList"), messagesEl = document.querySelector("#operatorMessages");
const replyForm = document.querySelector("#replyForm"), replyInput = document.querySelector("#replyInput");
const notificationButton = document.querySelector("#notificationButton");
let activeId = null, conversationCache = [], pendingChatId = new URLSearchParams(location.search).get("chat");

function withTimeout(promise, message = "The request took too long. Please check your connection and try again.") {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 15000))]);
}

async function operatorCall(action, data = {}) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("Your operator session has expired. Please sign in again.");
  const response = await fetch(functionUrl, { method: "POST", headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(15000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Request failed"); return result;
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#emailInput").value.trim();
  const password = document.querySelector("#operatorPasswordInput").value;
  const submit = event.currentTarget.querySelector("button"); const loginNotice = document.querySelector("#loginNotice");
  submit.disabled = true; submit.textContent = "Signing in…";
  try {
    const { error } = await withTimeout(client.auth.signInWithPassword({ email, password }));
    loginNotice.textContent = error ? error.message : "Signed in.";
  } catch (error) { loginNotice.textContent = error.message; }
  finally { submit.disabled = false; submit.textContent = "Sign in"; }
});
document.querySelector("#operatorForgotPasswordButton").addEventListener("click", async () => {
  const email = document.querySelector("#emailInput").value.trim();
  const notice = document.querySelector("#loginNotice");
  if (!email) { notice.textContent = "Enter your email address first."; return; }
  try {
    const { error } = await withTimeout(client.auth.resetPasswordForEmail(email, { redirectTo: new URL("auth.html?type=recovery", location.href).href }));
    notice.textContent = error ? error.message : "Check your email for a password-reset link.";
  } catch (error) { notice.textContent = error.message; }
});

async function loadConversations(refreshActive = true) {
  const result = await operatorCall("operator-list"); conversationCache = result.conversations; listEl.replaceChildren();
  for (const c of conversationCache) {
    const button = document.createElement("button"); button.className = `conversation-item ${c.id === activeId ? "active" : ""}`;
    const title = document.createElement("strong"); title.textContent = c.visitor_name || "Anonymous visitor";
    const preview = document.createElement("span"); preview.textContent = c.last_message || "New conversation";
    button.append(title, preview); button.addEventListener("click", () => openConversation(c.id)); listEl.append(button);
  }
  if (pendingChatId) {
    const requested = pendingChatId; pendingChatId = null;
    history.replaceState({}, "", location.pathname); await openConversation(requested, false);
  } else if (activeId && refreshActive) await openConversation(activeId, false);
}

async function openConversation(id, reloadList = true) {
  activeId = id; const result = await operatorCall("operator-thread", { conversationId: id });
  messagesEl.replaceChildren(); result.messages.forEach(m => renderMessage(m));
  document.querySelector("#threadTitle").textContent = result.conversation.visitor_name || "Anonymous visitor";
  document.querySelector("#threadMeta").textContent = `Started ${new Date(result.conversation.created_at).toLocaleString()}`;
  replyForm.classList.remove("hidden"); inboxView.classList.add("thread-open");
  if (reloadList) await loadConversations(false);
}

function renderMessage(message) {
  const row = document.createElement("div"); row.className = `message ${message.sender === "operator" ? "outgoing" : "incoming"}`;
  const bubble = document.createElement("div"); bubble.className = "bubble";
  if (message.kind === "image") { const image = new Image(); image.src = message.body; image.alt = "Drawing"; bubble.append(image); } else bubble.textContent = message.body;
  const time = document.createElement("time"); time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.append(bubble, time); messagesEl.append(row); messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendReply(kind, body) { const result = await operatorCall("operator-reply", { conversationId: activeId, kind, body }); renderMessage(result.message); }
replyForm.addEventListener("submit", async e => {
  e.preventDefault(); const body = replyInput.value.trim(); if (!body || !activeId) return;
  const sendButton = replyForm.querySelector(".send-button"); sendButton.disabled = true;
  try { await sendReply("text", body); replyInput.value = ""; }
  catch (error) { alert(error.message); }
  finally { sendButton.disabled = false; }
});
document.querySelector("#refreshButton").addEventListener("click", () => loadConversations().catch(error => alert(error.message)));
document.querySelector("#backButton").addEventListener("click", () => inboxView.classList.remove("thread-open"));

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function notificationRegistration() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
  return navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

async function updateNotificationState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { notificationButton.hidden = true; return; }
  const registration = await notificationRegistration();
  const subscription = await registration.pushManager.getSubscription();
  notificationButton.classList.toggle("notifications-on", Boolean(subscription) && Notification.permission === "granted");
  notificationButton.textContent = subscription ? "◆" : "♢";
  notificationButton.title = subscription ? "Notifications enabled" : "Enable notifications";
}

notificationButton.addEventListener("click", async () => {
  try {
    if (!config.vapidPublicKey || config.vapidPublicKey.includes("YOUR_PUBLIC")) throw new Error("Push notifications have not been configured yet.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");
    const registration = await notificationRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await operatorCall("operator-unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      await updateNotificationState();
      alert("Notifications are disabled on this device.");
      return;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) });
    await operatorCall("operator-subscribe", { subscription: subscription.toJSON() });
    await updateNotificationState();
    alert("Notifications are enabled on this device.");
  } catch (error) { alert(error.message); }
});

const dialog = document.querySelector("#drawingDialog"), canvas = document.querySelector("#drawingCanvas"), ctx = canvas.getContext("2d"); let drawing = false;
function sizeCanvas() { const ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; ctx.scale(ratio, ratio); ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.strokeStyle = "#17221c"; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight); }
function point(e) { const r = canvas.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX-r.left,t.clientY-r.top]; }
function start(e){drawing=true;ctx.beginPath();ctx.moveTo(...point(e));e.preventDefault()} function move(e){if(!drawing)return;ctx.lineTo(...point(e));ctx.stroke();e.preventDefault()} function stop(){drawing=false}
canvas.addEventListener("pointerdown",start); canvas.addEventListener("pointermove",move); canvas.addEventListener("pointerup",stop); canvas.addEventListener("pointerleave",stop);
document.querySelector("#drawButton").addEventListener("click",()=>{dialog.showModal();requestAnimationFrame(sizeCanvas)});
document.querySelector("#clearDrawing").addEventListener("click",sizeCanvas); document.querySelector("#closeDrawing").addEventListener("click",()=>dialog.close());
document.querySelector("#sendDrawing").addEventListener("click",async event=>{event.currentTarget.disabled=true;try{const image=canvas.toDataURL("image/jpeg",.72);await sendReply("image",image);dialog.close()}catch(error){alert(error.message)}finally{event.currentTarget.disabled=false}});

client.auth.onAuthStateChange((_event, session) => { const loggedIn = Boolean(session); loginView.classList.toggle("hidden", loggedIn); inboxView.classList.toggle("hidden", !loggedIn); if (loggedIn) queueMicrotask(() => { loadConversations().catch(error => alert(error.message)); updateNotificationState().catch(() => {}); }); });
setInterval(() => { if (!inboxView.classList.contains("hidden")) loadConversations().catch(() => {}); }, 5000);
