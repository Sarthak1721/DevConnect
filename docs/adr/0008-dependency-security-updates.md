# 0008. Security updates: the newest version that is both patched and mature

- Status: Accepted
- Date: 2026-11-03

## Context

While starting the web app, `next dev` reported that the installed Next.js (16.4.0) had published
security advisories and offered to hand an upgrade to 16.4.4 to a coding agent. A full audit of
the lockfile (631 packages) found:

| Package     | Severity | Advisory                                                              | Vulnerable    | Where it's used      |
| ----------- | -------- | --------------------------------------------------------------------- | ------------- | -------------------- |
| next        | critical | GHSA-2464-fhr4-w9xw: RCE in the Image Optimization API with SVG files | 16.0.0–16.4.0 | web app              |
| next        | critical | GHSA-673q-mjm6-r5xr: RCE in `use cache` functions with typed arrays   | 16.0.0–16.4.0 | web app              |
| next        | high     | GHSA-p3m5-59mp-jv5r: denial of service through Server Actions         | 16.0.0–16.4.0 | web app              |
| body-parser | high     | GHSA-27r3-jxmh-p828: denial of service via compressed request bodies  | 2.0.0–2.3.x   | API (`express.json`) |
| zod         | high     | GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized collections       | below 4.6.6   | API validation       |
| qs          | moderate | GHSA-6pq8-jhm2-2vcw: denial of service in `qs.stringify`              | 6.7.0–6.16.0  | Express, test client |
| minimatch   | moderate | GHSA-g3hv-75wg-m249: denial of service via glob patterns              | below 11.0.1  | lint tooling only    |

Next.js 16.4.4 had been published less than 24 hours earlier, so our `minimumReleaseAge: 1440`
rule (ADR 0002) refused to install it.

## Decision

1. For a security fix, choose the newest version that is outside the vulnerable range **and** at
   least 24 hours old:

   `v* = max { v : v ∉ vulnerable range, now − published(v) ≥ 24 h }`

   For Next.js that was 16.4.3 (patched, published 2026-10-23), not 16.4.4. The age gate is only
   bypassed if no patched, mature version exists and the issue is exploitable in our setup.

2. Applied:
   - `next` and `eslint-config-next` 16.4.0 → 16.4.3
   - the `zod` catalog entry ^4.6.5 → ^4.6.7
   - `body-parser` 2.3.0 → 2.4.0 and `qs` 6.16.0 → 6.17.1 through `pnpm audit --fix=update`
     (lockfile only, inside the ranges Express already allows)

3. Accepted risk: `minimatch`. It is only reached through ESLint and typescript-eslint, which read
   glob patterns from our own config files, and no patched version fits the ranges those tools
   allow. It is listed in `auditConfig.ignoreGhsas` (`pnpm-workspace.yaml`) with this reasoning.

4. Next.js's upgrade reminders stay on (`experimental.agentUpgrade: 'security'`, written out
   explicitly). When one appears, choose **Skip** and upgrade deliberately: review the diff, run
   the checks, commit. Agents don't change dependencies unattended.

## Consequences

- `pnpm audit` reports nothing except the documented exception. It becomes a CI step when CI is
  next extended (Phase 2).
- A fix can wait up to 24 hours when only a brand-new release is patched; how exploitable the issue
  is in our setup decides whether that wait is acceptable.
- Every ignored advisory needs a revisit trigger: remove the minimatch entry once ESLint and
  typescript-eslint use minimatch 11.

## Alternatives considered

- **Install 16.4.4 at once via `minimumReleaseAgeExclude`:** fast, but it skips the protection
  exactly in the window when malicious releases appear, and 16.4.3 was already patched.
- **Let the agent finish unattended:** it edited files and ran commands in auto-approve mode;
  dependency changes should be reviewed and committed on purpose.
- **Force minimatch 11 with an override:** crosses major versions underneath tools not built for
  it, to fix a low-risk, development-only issue.
- **Turn reminders off (`agentUpgrade: false`):** loses the early warning that surfaced two
  critical advisories.
