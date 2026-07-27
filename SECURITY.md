# Security Policy

## Supported version

Only the latest tagged release is supported with security updates.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not open a
public issue and do not include real user exports, tokens, credentials, or
health information.

Include the affected version, impact, reproduction steps, and a minimal
proof-of-concept using synthetic data. The maintainer will acknowledge a report
when practical, investigate it privately, and coordinate remediation and
disclosure.

Never commit service-account keys. Deployments authenticate through short-lived
GitHub OIDC credentials.
