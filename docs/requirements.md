# Requirements Specification

## Purpose

The system MUST support review of changes captured in a Git working directory.

The system MUST support review feedback that can be used by both a human reviewer and an AI agent.

## Requirements

The system SHOULD remain simple in scope and operation.

The system MUST be possible to run locally.

The system MUST allow a reviewer to review changes captured in a Git working directory.

The system MUST allow reviewed changes to be viewed in a side-by-side format.

The system MUST allow reviewed changes to be viewed in a unified format.

The system MUST allow a reviewer to point to a changed line and provide a comment on that change.

The system MUST provide all review comments in text form.

The text form of review comments MUST be suitable as input for an AI agent to process.

## Version Changes

- 1.0: Added the initial requirements for local use, review of changes captured in a Git working directory, side-by-side and unified change views, line-level commenting, and text-form comment export for AI-agent processing.
