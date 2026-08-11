const config = window.CHAT_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const functionUrl = `${config.supabaseUrl}/functions/v1/chat`;
const loginView = document.querySelector("#userLoginView");
const userApp = document.querySelector("#userApp");
const messagesEl = document.querySelector("#messages");
const listEl = document.querySelector("#userConversationList");
const form = document.querySelector("#composer");
const input = document.querySelector("#messageInput");
const notice = document.querySelector("#notice");
let activeId = null;
let knownIds = new Set();

async function call(action, data = {}) {
  if (config.supabaseUrl.includes("YOUR_PROJECT")) throw new Error("Chat is not configured yet.");
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong");
  return result;
}

function renderMessage(message) {
  if (knownIds.has(message.id)) return;
  knownIds.add(message.id);
  const row = document.createElement("div");
  row.className = `message ${message.sender === "visitor" ? "outgoing" : "incoming"}`;
  const bubble = document.createElement("div"); bubble.className = "bubble";
  if (message.kind === "image") { const image = new Image(); image.src = message.body; image.alt = "Hand-drawn reply"; bubble.append(image); }
  else bubble.textContent = message.body;
  const time = document.createElement("time"); time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.append(bubble, time); messagesEl.append(row); messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadConversations(selectFirst = false) {
  const result = await call("user-conversations"); listEl.replaceChildren();
  for (const conversation of result.conversations) {
    const button = document.createElement("button"); button.className = `conversation-item ${conversation.id === activeId ? "active" : ""}`;
    const title = document.createElement("strong"); title.textContent = conversation.title || "Chat with Ollie";
    const preview = document.createElement("span"); preview.textContent = conversation.last_message || "No messages yet";
    button.append(title, preview); button.addEventListener("click", () => openConversation(conversation.id)); listEl.append(button);
  }
  if (selectFirst && result.conversations[0]) await openConversation(result.conversations[0].id, false);
  if (!result.conversations.length) showEmpty();
}

function showEmpty() {
  activeId = null; knownIds.clear(); messagesEl.replaceChildren();
  const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "Start a new chat whenever you’re ready. You’ll find the complete history here."; messagesEl.append(empty);
}

async function openConversation(id, refreshList = true) {
  activeId = id; knownIds.clear(); messagesEl.replaceChildren();
  const result = await call("user-thread", { conversationId: id }); result.messages.forEach(renderMessage);
  userApp.classList.remove("show-sidebar"); if (refreshList) await loadConversations();
}

async function newConversation() {
  const result = await call("user-new"); await loadConversations(); await openConversation(result.conversation.id);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); const body = input.value.trim(); if (!body) return;
  const button = form.querySelector(".send-button"); button.disabled = true;
  try {
    if (!activeId) await newConversation();
    const result = await call("user-message", { conversationId: activeId, body }); renderMessage(result.message); input.value = ""; input.style.height = "auto"; await loadConversations();
  } catch (error) { notice.textContent = error.message; } finally { button.disabled = false; }
});

document.querySelector("#userLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.querySelector("#userEmailInput").value.trim();
  const password = document.querySelector("#userPasswordInput").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  document.querySelector("#userLoginNotice").textContent = error ? error.message : "Signed in.";
});
document.querySelector("#createAccountButton").addEventListener("click", async () => {
  const username = document.querySelector("#usernameInput").value.trim();
  const email = document.querySelector("#userEmailInput").value.trim();
  const password = document.querySelector("#userPasswordInput").value;
  const notice = document.querySelector("#userLoginNotice");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) { notice.textContent = "Choose a username of 3–24 letters, numbers, or underscores."; return; }
  if (!email || password.length < 12) { notice.textContent = "Enter a valid email and a password of at least 12 characters."; return; }
  const safeRedirect = new URL("auth.html", location.href).href;
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: safeRedirect, data: { username } } });
  notice.textContent = error ? error.message : data.session ? "Account created." : "Account created. Check your email to confirm it, then sign in.";
});
document.querySelector("#forgotPasswordButton").addEventListener("click", async () => {
  const email = document.querySelector("#userEmailInput").value.trim();
  const notice = document.querySelector("#userLoginNotice");
  if (!email) { notice.textContent = "Enter your email address first."; return; }
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL("auth.html?type=recovery", location.href).href });
  notice.textContent = error ? error.message : "Check your email for a password-reset link.";
});
document.querySelector("#newChatButton").addEventListener("click", newConversation);
document.querySelector("#signOutButton").addEventListener("click", () => client.auth.signOut());
document.querySelector("#showChatsButton").addEventListener("click", () => userApp.classList.add("show-sidebar"));
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; });

client.auth.onAuthStateChange((_event, session) => {
  const loggedIn = Boolean(session); loginView.classList.toggle("hidden", loggedIn); userApp.classList.toggle("hidden", !loggedIn);
  if (loggedIn) loadConversations(true).catch(error => notice.textContent = error.message);
});
setInterval(async () => { if (activeId && !userApp.classList.contains("hidden")) { try { const result = await call("user-thread", { conversationId: activeId }); result.messages.forEach(renderMessage); } catch {} } }, config.pollIntervalMs || 4000);
