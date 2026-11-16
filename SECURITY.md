# Security

This preview integrates OAuth credentials and external tools. Only DSH 0.2.2-rc.2 is currently targeted; Desktop acceptance is pending. See the README for deployment limitations.

Do not put tokens, client secrets, authorization codes, credential files or unsanitized logs in public issues or pull requests.

If the repository's Security tab provides **Report a vulnerability**, use that private channel. If it is unavailable, open a public issue requesting a private contact channel without vulnerability details. Do not disclose exploit instructions or credentials while waiting for a private channel. There is no guaranteed response-time commitment.

For an exposed credential, revoke or rotate it at its issuer. Clearing local plugin authorization does not revoke it at the server.

The maintainer should enable GitHub private vulnerability reporting before making the repository public. Reports should identify the plugin and DSH versions, deployment type, impact, and a reproduction using synthetic credentials and local fixtures.
