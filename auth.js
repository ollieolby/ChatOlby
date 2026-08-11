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
  let { data: { session }, error } = await client.auth.getSession();
  const code = new URLSearchParams(location.search).get("code");
  if (!session && code) {
    const exchanged = await client.auth.exchangeCodeForSession(code);
    session = exchanged.data.session;
    error = exchanged.error;
  }
  if (error) { showError(error.message); return; }
  if (!session) { showError("The link may have expired or already been used. Request a new email from the sign-in page."); return; }
  if (recoveryRequested) {
    icon.textContent = "↻"; title.textContent = "Choose a new password"; message.textContent = "Use at least 12 characters and do not reuse an old password."; resetForm.classList.remove("hidden");
  } else showSuccess("Email confirmed", "Your account is ready. You can continue to your chats.");
}

resetForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = resetForm.querySelector("button");
  const password = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#confirmPassword").value;
  if (password !== confirmation) { message.textContent = "The passwords do not match."; return; }
  if (password.length < 12) { message.textContent = "Use a password of at least 12 characters."; return; }
  submitButton.disabled = true; submitButton.textContent = "Updating…"; message.textContent = "Securely updating your password…";
  try {
    const result = await Promise.race([
      client.auth.updateUser({ password }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("The password update timed out. Request a fresh reset email and try again.")), 15000)),
    ]);
    if (result.error) showError(result.error.message);
    else { resetForm.classList.add("hidden"); showSuccess("Password updated", "Your new password is ready to use."); }
  } catch (error) { showError(error.message); }
  finally { submitButton.disabled = false; submitButton.textContent = "Set new password"; }
});

initialise();
