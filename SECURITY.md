# Security Policy

## Supported versions

Security fixes are applied to the current `main` branch. There are no
long-lived release branches, so `main` is the only supported line.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem, and don't
mention it in a pull request discussion, where others could see it.

Use GitHub's **Report a vulnerability** button (Repository → Security tab →
"Report a vulnerability") to open a private security advisory. Anything
sent there is visible only to the maintainers until it is ready to be
disclosed.

In the report, please include:

- what the vulnerability is and which component is affected
  (nginx config, the app, the Compose file, a script, …)
- the commit or release you found it on
- steps to reproduce, and any proof-of-concept you can safely share
- your sense of the impact and how you'd recommend fixing it

## What to expect

- You'll get an acknowledgement as soon as the report is read — for
  a one-person project that is usually within a few business days, but
  this is best-effort rather than a contract.
- We'll agree on a fix and a disclosure timeline with you, and credit
  you in the announcement if you'd like.
- Once the fix ships, the advisory is published and the coordinated
  disclosure is made public.

Thanks for taking the time to report it responsibly.
