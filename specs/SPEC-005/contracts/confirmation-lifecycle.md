# Confirmation lifecycle — superseded for SPEC-005@2

The previous multi-step persistent confirmation/grant lifecycle is not part of the POC. A direct, clear user request may create one task, subtask, or recurring template without an additional confirmation dialog.

Clarification is required before a write when required details are absent or ambiguous. A prior user message in the same active chat may supply the intent; assistant/model text alone cannot authorize it.

The POC adds no confirmation table, persistent grant, transaction ledger, or confirmation RPC. Editing and deletion operations are not registered.
