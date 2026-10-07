# Skill conventions

Each server's consumer skill instructs an agent building any client
of the served data — a web view, a script, another service — against
a base URL it is given. It speaks the wire's vocabulary only — the
server contract, never the storage behind it —
and ships instructions, not code: a client writes its own calls.

The skill's description must name the situations that should trigger
it, rather than assuming the reader already thinks of the task as
writing a client.

Beyond its server's coverage list, every skill covers:

- starting the server when none is running — run `file-server` or
  `vault-server` and use the printed `url:`. When the binary is missing,
  build it from a clone of this repository.
- errors: every error is `{ "error": … }` with a meaningful status,
  surfaced rather than swallowed.

The skill must not assume the consumer is a browser, name deployment
specifics such as hosts or base URLs, or describe how the server is
implemented. A skill ships only once its server is implemented, so
skill discovery never advertises a server that cannot run.
