import type { ReactNode } from "react";
import { ThemeSwitch } from "./ThemeSwitch";

/** The single-card layout of the sign-in, account, and policy pages. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <header className="auth-header">
        <a className="brand" href="/">
          ct<span className="brand-dot">.</span>
        </a>
        <ThemeSwitch />
      </header>
      <section className="card auth-card">{children}</section>
    </main>
  );
}

/**
 * The privacy policy and support pages, which both stores require the app to
 * link to. They are part of the bundle, so the app opens them offline too.
 */
export function PolicyLinks() {
  return (
    <nav className="policy-links" aria-label="Policies">
      <a href="/privacy">Privacy policy</a>
      <a href="/support">Support</a>
    </nav>
  );
}
