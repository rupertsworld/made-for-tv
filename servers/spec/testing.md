# Testing conventions

Each Node server defines a `test` script. Its `test/*.test.ts` files run
natively with `node --test`, after `pretest` type-checks and builds the
package. Tests use temporary directories and run the real server over
HTTP, in-process or as the built binary. They do not need credentials or
an external service.

Some tests spawn the built binary as a user would run it. These cover
permissions, the banner, ports, signals, and a round trip over the
shipped CLI. Each server specification lists its own coverage.
