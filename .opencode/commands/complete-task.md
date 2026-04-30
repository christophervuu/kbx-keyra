Verify that the following task is ready to be marked done.

Task: [FS-### / T-##]

Check each of the following:

1. All items listed in `Acceptance Checks` are satisfied
2. Required tests pass
3. Typecheck passes for all touched files
4. Lint passes for all touched files
5. No scope expansion occurred — only the files listed in `Relevant Areas` were modified (or the deviation is explicitly noted)

If all checks pass:
- Update the task `Status` field to `done`
- Report which Acceptance Checks were verified and how

If any check fails:
- Do not mark the task done
- Report exactly which check failed and what remediation is needed