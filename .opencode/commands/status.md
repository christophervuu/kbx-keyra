Report the current state of all active work.

1. Read every spec folder in `forge/active/`
2. For each spec, read `spec.md` and all task files in `tasks/`
3. Produce the following summary:

---

## Active Specs

For each spec in `forge/active/`:

**FS-### — {Title}**
- Spec status: {status}
- Type: {type}
- Tasks: {N} total — {N} todo, {N} in_progress, {N} blocked, {N} done
- Blocked tasks: list any tasks with Status: blocked and their blocker
- Open questions: list any unresolved items from the spec's Open Questions section

---

## Summary

- Total active specs: N
- Total tasks: N
- Todo: N | In progress: N | Blocked: N | Done: N
- Specs ready to archive (all tasks done): list FS numbers if any

If `forge/active/` is empty, report: "No active work items."