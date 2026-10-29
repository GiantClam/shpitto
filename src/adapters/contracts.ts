export type AdapterFailure = Readonly<{
  code: string;
  retryable: boolean;
  message: string;
}>;

export type AdapterResult<TValue> =
  | Readonly<{ok: true; value: TValue}>
  | Readonly<{ok: false; error: AdapterFailure}>;

export interface MailAdapter {
  send(message: Readonly<{to: string; subject: string; body: string}>): Promise<AdapterResult<void>>;
}

export interface StorageAdapter {
  put(input: Readonly<{key: string; contentType: string; body: Uint8Array}>): Promise<AdapterResult<{key: string}>>;
}

export type {ProviderPort} from './providers/port.ts';
