# LENS Repository Instructions

## Mandatory status-document update

Every user-requested change to the LENS project must update the relevant implementation status document in the same work:

- Server, API, data model, ingestion, processing, retrieval, security, or operational changes: update `server/PROJECT-REQUIREMENTS-AND-STATUS.md`.
- Client, route, component, user-flow, presentation, accessibility, or client integration changes: update `client/PROJECT-REQUIREMENTS-AND-STATUS.md`.
- Cross-cutting changes: update both documents.

For each affected document:

1. Update the relevant requirement row and its **Implemented**, **Partial**, or **Not implemented** status.
2. Update the implemented surface, limitations, and future enhancement sections when the change affects them.
3. Update verification evidence after running the appropriate checks.
4. Set `Last reconciled` to the date of the change.
5. Add one concise entry to the document's **Change history** with the date, completed behavior, remaining limitation, and verification result.

Do not report a project change as complete until the relevant status document is synchronized. Documentation-only wording or formatting edits may use a single change-history entry without changing requirement status.
