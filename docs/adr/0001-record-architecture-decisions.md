# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-10-10

## Context

DevConnect is built over 19 phases. Choices made early (database, API style, auth design) shape
everything after them, and the project must be explainable in technical interviews. Reasoning that
lives only in chat logs or memory gets lost.

## Decision

Record every significant architectural decision as a numbered Markdown file in `docs/adr/`, using
the template in [README.md](README.md).

## Consequences

- Decisions and their trade-offs are reviewable in the same pull request as the code.
- Interview answers to "why did you choose X?" come straight from these files.
- Writing an ADR takes a few minutes per decision; that cost is accepted.

## Alternatives considered

- **A single architecture document:** harder to see when and why each decision was made, and it
  tends to be rewritten instead of appended to.
- **No written record:** the reasoning disappears.
