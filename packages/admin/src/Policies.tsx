import { type ReactNode, useEffect } from "react";
import { Frame, PolicyLinks } from "./Frame";

// The store listings link to these pages on the hosted dashboard, which serves
// them before sign-in; docs/privacy.md is the authoritative description of
// what CT collects, and this policy must stay consistent with it.
const SUPPORT_EMAIL = "support@a2f0.net";

function Policy({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · CT`;
  }, [title]);
  return (
    <Frame>
      <article className="policy">
        <h1>
          {title}
          <span>.</span>
        </h1>
        {children}
      </article>
      <PolicyLinks />
    </Frame>
  );
}

const Email = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

function Privacy() {
  return (
    <Policy title="Privacy policy">
      <p className="muted">Effective October 24, 2026 (UTC)</p>
      <p>
        CT is a small click tracker. This policy covers its private dashboard at
        ct-admin.a2f0.net and the CT app for iPhone, iPad, and Android, which
        shows the same dashboard to the administrators we provision. There is no
        registration, and the dashboard has no ads.
      </p>
      <h2>Your administrator account</h2>
      <p>
        We create each account with a name and email address and store a salted
        hash of its password, never the password itself. When you sign in, we
        store a session with its token, its expiry, and the IP address and
        browser or app identification (user agent) of the request. A session
        expires no more than eight hours after you last use it, and ends when
        you sign out or your password is reset. Expired sessions are deleted
        daily, normally within 24 hours. To limit repeated sign-in attempts, we
        keep the request IP address with the sign-in route for everyone who
        tries, and delete those records once they have been unused for 24 hours,
        normally within 48 hours.
      </p>
      <p>
        We use this information only to sign you in, keep you signed in, and
        protect accounts from abuse. It is never sold, used for advertising, or
        combined with the click data below. Your account stays until we delete
        it; email us to have it deleted.
      </p>
      <h2>In the app</h2>
      <p>
        The app keeps its session cookie in your device's cookie store and your
        light or dark theme choice in its own storage, and sends the theme to no
        one. It records no clicks and contains no analytics, advertising,
        tracking, or crash-reporting code. Android backups of the app are turned
        off. Apple and Google handle app downloads under their own privacy
        policies and give us download statistics and, where you allow it, crash
        reports, which we use only to understand and fix problems.
      </p>
      <h2>Click data shown in the dashboard</h2>
      <p>
        Websites registered with CT can send it the clicks people make on their
        pages. Each click records the site, a page name the site chooses, the
        app and environment, the kind of element clicked and an optional label
        the site sets, the time, the request IP address, and the approximate
        location Cloudflare derives from it (country, continent, region, city,
        and time zone). CT reads no page text, form values, or web addresses,
        and sets no cookies or visitor identifiers. It sends nothing when the
        browser asks sites not to track it with Do Not Track, when the CT
        browser extension is on, or when the site's opt-out is set, and it
        honors Global Privacy Control unless a site explicitly chooses
        otherwise. Clicks are deleted after 90 days. Administrators can view
        this data and can delete every click recorded from an IP address.
      </p>
      <h2>Service providers</h2>
      <p>
        Cloudflare hosts CT and its database and processes its network traffic
        under{" "}
        <a href="https://www.cloudflare.com/privacypolicy/">
          Cloudflare's privacy policy
        </a>
        . No one else receives this data. Deleted records can remain in
        Cloudflare's database recovery history until its recovery window ends.
      </p>
      <h2>Security</h2>
      <p>
        Connections use HTTPS. The session cookie is Secure and HttpOnly, and
        only signed-in administrators can see click data.
      </p>
      <h2>Children</h2>
      <p>The dashboard and app are for the administrators we provision.</p>
      <h2>Changes and contact</h2>
      <p>
        If this policy changes, we will post the new version here with a new
        effective date. To ask about your data, or to have your account or the
        clicks recorded from your IP address deleted, email <Email />.
      </p>
    </Policy>
  );
}

function Support() {
  return (
    <Policy title="Support">
      <p>
        CT shows administrators the clicks recorded on the websites registered
        with it: an overview, recent clicks, and where they came from. The CT
        app for iPhone, iPad, and Android is the same dashboard.
      </p>
      <h2>Access and passwords</h2>
      <p>
        There is no registration. We create each administrator account and can
        reset its password if you lose it. Once signed in, you can change your
        password on the Account page, which signs out your other sessions.
      </p>
      <h2>Contact</h2>
      <p>
        For help, access, a password reset, or to report a problem, email{" "}
        <Email />. If something isn't working, mention your device, its system
        version, and the app version.
      </p>
    </Policy>
  );
}

/** The public page for this path, if it is one; it needs no session. */
export function policyPage(pathname: string) {
  if (pathname === "/privacy") return <Privacy />;
  if (pathname === "/support") return <Support />;
  return null;
}
