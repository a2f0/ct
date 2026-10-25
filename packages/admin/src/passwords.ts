export type PasswordSaver = (
  username: string,
  password: string,
) => Promise<void>;

let nativeSaver: PasswordSaver | undefined;

/** The native shell installs its system password manager before rendering. */
export function configurePasswordSaver(saver: PasswordSaver | undefined) {
  nativeSaver = saver;
}

export const hasNativePasswordSaver = () => Boolean(nativeSaver);

type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
}) => Credential;

/** Offer only successfully authenticated credentials; saving is best effort. */
export async function rememberPassword(
  id: string,
  password: string,
): Promise<void> {
  try {
    if (nativeSaver) {
      await nativeSaver(id, password);
      return;
    }
    const PasswordCredential = (
      window as Window & { PasswordCredential?: PasswordCredentialConstructor }
    ).PasswordCredential;
    if (PasswordCredential && navigator.credentials)
      await navigator.credentials.store(
        new PasswordCredential({ id, password }),
      );
  } catch {
    // Declining or failing to save must never turn a successful login into an error.
  }
}
