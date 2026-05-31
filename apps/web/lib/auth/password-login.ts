const DEFAULT_LOGIN_ERROR = "Invalid login credentials";
const NETWORK_LOGIN_ERROR = "Unable to reach the authentication service. Please try again.";

export type PasswordLoginPayload = {
  email: string;
  password: string;
  projectId?: string;
  siteKey?: string;
};

export type PasswordLoginResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

export async function submitPasswordLogin(
  payload: PasswordLoginPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<PasswordLoginResult> {
  try {
    const response = await fetchImpl("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || DEFAULT_LOGIN_ERROR,
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: NETWORK_LOGIN_ERROR,
    };
  }
}
