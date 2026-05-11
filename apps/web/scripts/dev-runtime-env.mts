export function withLocalChatTaskStoreDefaults(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  if (String(nextEnv.CHAT_TASKS_USE_SUPABASE || "").trim() === "") {
    nextEnv.CHAT_TASKS_USE_SUPABASE = "1";
  }
  return nextEnv;
}
