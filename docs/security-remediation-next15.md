# Security Remediation Note

This remediation intentionally keeps FlowLens on the Next.js 15 line and updates to
`next@15.5.25` (the latest 15.x, which clears the critical/high Next advisories published
after the original `15.5.18` bump).

Other direct upgrades needed to clear `pnpm audit`:

- `vitest@^4.1.11`, `vite@^8.3.0`, `postcss@^8.5.28`, `tsx@^4.23.13` (patch/minor)
- `csv-parse@^7` (was 5; the `parse` stream and `csv-parse/sync` APIs used here are unchanged)
- `echarts@^6` with `echarts-for-react@^3.0.6` (was 5; charts verified to render)

Transitive fixes that parents have not released yet are pinned through `pnpm.overrides`
in `package.json` (sharp, brace-expansion, browserslist, baseline-browser-mapping, js-yaml,
nanoid, fflate, esbuild, postcss-selector-parser, ws). Drop an override once its parent
dependency ships the patched version.

Next.js 16 is available, but this PR is scoped to security remediation and avoids a
framework modernization jump while preserving the current production behavior. If
future audits require Next.js 16 to clear high or critical advisories, handle that
as a separate upgrade PR with its own regression testing.
