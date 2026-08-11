const config = window.CHAT_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const title = document.querySelector("#authTitle");
const message = document.querySelector("#authMessage");
const icon = document.querySelector("#authIcon");
const resetForm = document.querySelector("#resetForm");
const continueLink = document.querySelector("#continueLink");
const recoveryRequested = new URLSearchParams(location.search).get("type") === "recovery";

function showSuccess(heading, body) {
  icon.textContent = "✓"; title.textContent = heading; message.textContent = body; continueLink.classList.remove("hidden");
}

function showError(body) {
  icon.textContent = "!"; title.textContent = "That link did not work"; message.textContent = body; continueLink.textContent = "Return to sign in"; continueLink.classList.remove("hidden");
}

async function initialise() {
  const { data: { session }, error } = await client.auth.getSession();
  if (error) { showError(error.message); return; }
  if (!session) { showError("The link may have expired or already been used. Request a new email from the sign-in page."); return; }
  if (recoveryRequested) {
    icon.textContent = "↻"; title.textContent = "Choose a new password"; message.textContent = "Use at least 12 characters and do not reuse an old password."; resetForm.classList.remove("hidden");
  } else showSuccess("Email confirmed", "Your account is ready. You can continue to your chats.");
}

resetForm.addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#confirmPassword").value;
  if (password !== confirmation) { message.textContent = "The passwords do not match."; return; }
  if (password.length < 12) { message.textContent = "Use a password of at least 12 characters."; return; }
  const { error } = await client.auth.updateUser({ password });
  if (error) showError(error.message); else { resetForm.classList.add("hidden"); showSuccess("Password updated", "Your new password is ready to use."); }
});

initialise();
