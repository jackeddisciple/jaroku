"""stdout guard — the hard guarantee that generated code cannot corrupt the trace.

Generated agents are written by a model. However emphatic the generation system prompt is
about "never write to stdout", a prompt is a request, not an invariant. A single stray
``print()`` in a generated tool would interleave text with the newline-delimited JSON event
stream, and the Node process manager would report it as a parse error — or worse, a partial
line would land mid-event and silently corrupt a trace.

So the runner does not rely on the prompt. Before importing any generated module it:

  1. ``os.dup(1)``  — takes a private copy of the real stdout file descriptor and pins it as
     the event stream (``schema.bind_event_stream``). Events keep flowing to the pipe the
     process manager is reading.
  2. ``os.dup2(2, 1)`` — repoints fd 1 at stderr, so even a C-level write (a subprocess, a
     native extension) that bypasses Python lands on stderr.
  3. ``sys.stdout = sys.stderr`` — the Python-level view, so ``print()`` is redirected too.

After this, "write to stdout" and "write to stderr" are the same thing for every line of
code that is not the event emitter. The guard is irreversible by design.
"""

from __future__ import annotations

import os
import sys
from typing import TextIO

from jaroku_interceptor.schema import bind_event_stream

_installed = False


def install_stdout_guard() -> TextIO:
    """Pin the event stream to the real fd 1, then redirect fd 1 to stderr.

    Returns the pinned event stream. Idempotent: calling twice is a no-op, because the
    second call would dup an already-redirected fd 1 and send events to stderr.
    """
    global _installed
    if _installed:
        return sys.stderr

    # A private copy of the original stdout. Line-buffered so each event lands whole and
    # promptly — the UI streams these live.
    event_fd = os.dup(1)
    events = os.fdopen(event_fd, "w", buffering=1, encoding="utf-8")
    bind_event_stream(events)

    # fd 1 -> stderr. Catches C-level writes that never touch sys.stdout.
    os.dup2(2, 1)
    # ...and the Python-level view, so print() with no file= goes to stderr.
    sys.stdout = sys.stderr

    _installed = True
    return events
