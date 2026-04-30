Archive a completed spec.

Spec: [FS-###]

Before archiving, verify all of the following:

1. Every task file in `forge/active/FS-###/tasks/` has `Status: done`
2. Every task's `Acceptance Checks` are satisfied

If any task is not done:
- Do not archive
- List which tasks are not done and their current status
- Stop here

If all tasks are done:

1. Update the spec `Status` field in `forge/active/FS-###/spec.md` to `completed`
2. Move the entire `forge/active/FS-###/` folder to `forge/completed/FS-###/`
3. Confirm the move: `forge/completed/FS-###/` exists and `forge/active/FS-###/` no longer exists
4. Report: "FS-### archived. N tasks completed."