---
name: Workflow callback indexing failure
description: Covers a Replit workflow-control failure that occurs before the configured command is run.
---

If workflow status/restart calls fail in their own ripgrep step with a missing `.local/secondary_skills/...` path, first verify that path directly. When it exists and repeated workflow calls still fail, classify this as a platform workflow-control/indexing failure rather than an application startup failure.

**Why:** The workflow manager can stop a running workflow during a restart attempt and then fail before relaunching it. Direct detached processes started from one-off shell commands are reaped and do not restore the managed preview, so repeated manual starts are not a reliable substitute.

**How to apply:** Retry the workflow manager once after verifying the reported path, then stop. Validate code with focused tests, builds, syntax checks, and direct startup logs where possible; report that managed preview verification is blocked by the workflow tool itself.