# Security Remediation Note

This remediation intentionally keeps FlowLens on the Next.js 15 line and updates to
`next@15.5.18`.

Next.js 16 is available, but this PR is scoped to security remediation and avoids a
framework modernization jump while preserving the current production behavior. If
future audits require Next.js 16 to clear high or critical advisories, handle that
as a separate upgrade PR with its own regression testing.
