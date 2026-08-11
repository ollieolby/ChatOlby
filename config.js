// Copy your project URL and public anon key from Supabase → Project Settings → API.
window.CHAT_CONFIG = {
  supabaseUrl: "https://rnhkqmhtljtredrwwixq.supabase.co",
  supabaseAnonKey: "sb_publishable_xGKptEGBldczlXJ9IqVpfg_OS2xpaCJ",
  // Generate this alongside VAPID_PRIVATE_KEY during push setup. This key is safe to publish.
  vapidPublicKey: "BJ-0ckvEmlakg9krFyCP7H5GtslogsAJRQK-fHX3IYjWfSAMV517vPoWs7KoYs99T6707NcIX2eRPTw9068J4-Y",
  pollIntervalMs: 4000,
};
