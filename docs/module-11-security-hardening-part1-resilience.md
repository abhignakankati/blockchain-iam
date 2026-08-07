# Module 11 (Part 1): Blockchain Listener Resilience

## Purpose
Address the WebSocket idle-disconnection gap discovered in Module 8 and
documented as a known limitation, where the live event listener could
silently stop receiving events with no error surfaced at all.

## Attempt 1: Manual reconnect-with-backoff (reverted)
Implemented explicit `close`/`error` handlers on the WebSocket with
exponential backoff reconnection, plus a post-reconnect backfill.

**Discovered during live disconnect testing:** this fought with Ethers
v6's own internal `JsonRpcApiProvider` retry behavior (visible as
"JsonRpcProvider failed to detect network..." log lines originating from
Ethers itself, not our code). The two independent retry mechanisms
triggered each other's event handlers, producing a genuine connection
storm - a single Hardhat node restart cascaded into over 30 concurrent
WebSocket connection attempts within seconds, confirmed via a
`generation` counter added specifically to diagnose the issue.

A first fix attempt (generation-tagging + single-flight reconnect lock)
reduced but did not eliminate the storm - concurrent connections still
occurred in bursts of 4-5 at a time.

## Final Design: Best-effort WebSocket + frequent periodic backfill
Rather than continue adding locking complexity to fully tame an
interaction with library internals outside our control, the connection
strategy was simplified:
- A single WebSocket connection for low-latency live event delivery, with
  **no custom reconnect logic** at all.
- A periodic backfill (via the same `runBackfill()` used by the manual
  script) running every **60 seconds**, acting as the actual correctness
  guarantee rather than a mere convenience.

**Trade-off accepted:** worst-case latency for catching a missed event is
now up to 60 seconds (down from indefinite silence in the original bug,
but no longer "instant" as the failed reconnect attempt aimed for). In
exchange, the system is provably storm-proof - it has no code path that
can create more than one connection attempt at a time, since it makes
none beyond the initial one.

**Verified:** forced a Hardhat node restart (the exact scenario that
previously caused the storm) - confirmed zero cascading connection
attempts, and confirmed a real subsequent transaction was correctly
captured and indexed with an accurate timestamp after the periodic
backfill cycle ran, with the server process remaining stable and
responsive (`/health`) throughout.

## Lesson
A simpler, slightly slower design beat a cleverer, fragile one. When a
custom resilience mechanism starts fighting a library's own internal
resilience mechanism, the fix is not always more locking - sometimes it's
removing the custom mechanism entirely and leaning on a dumber, more
predictable safety net instead.
