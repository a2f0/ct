# CT dashboard

The React/Vite dashboard for CT. Administrators see click activity for the
registered sites and can forget the clicks recorded from an IP address. The
admin Worker in [packages/api](../api/README.md) serves its build at
<https://ct-admin.a2f0.net>, including the public privacy policy and support
pages and the browser extension downloads, and the
[CT app](../app-capacitor/README.md) bundles the same UI for iOS and Android.

## Accounts

Sign in at <https://ct-admin.a2f0.net>. Registration is disabled; administrators
provision accounts with `bun run admin:user -- create --remote --email <email>`.
The CLI asks for a password without echoing it. Signed-in users can change their
password at /account; an operator can recover access with the CLI's reset
action, which revokes every existing session. See
[operations](../../docs/operations.md#administrator-accounts) for first
deployment and account recovery.

## Development

`bun run dev` from the repository root serves this UI on
`http://127.0.0.1:5173` for static UI development only. To sign in locally,
build it and run the admin Worker on 8788 as the
[API README](../api/README.md#local-development) describes.
