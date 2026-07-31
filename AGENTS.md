# AGENTS.md

## Conventions

  - All functions, models, types, and other complex symbols must have an attached docstring.
  - Prefer small, single-purpose modules and functions. If a unit needs "and" in its responsibility, split it.
  - Core business logic must depend on interfaces or plain domain types, not vendor or framework-specific types.
  - New behaviour should usually be added by introducing a new implementation behind an existing interface, not by branching through existing code.
  - Avoid boolean flag parameters when they create multiple code paths; prefer separate functions or strategy objects.
  - Keep side effects at the edges. Parsing, ranking, persistence, API calls, and message delivery should remain separable.
  - Comments should explain intent, invariants, or non-obvious tradeoffs, not restate the code.
  - Public interfaces and extension points must document inputs, outputs, failure modes, and any invariants callers must preserve.
  - Tests should cover behaviour at module boundaries, especially around selection logic, provider adapters, and idempotency guarantees.