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

The system MUST allow a reviewer to edit an existing comment.

The system MUST allow a reviewer to delete an existing comment.

The system MUST detect when a stored comment's diff anchor no longer matches the current diff and mark that comment as outdated.

The system MUST provide all review comments in text form.

The text form of review comments MUST be suitable as input for an AI agent to process.

The system MUST allow the reviewer to control how many context lines are shown around changes (none, 3, 20, 100, or full file).

The system MUST allow the reviewer to hide removed lines in the unified view.

The system SHOULD display changed files in a hierarchical file tree with collapsible folders.

The system SHOULD show a comment count badge on each file that has comments.

The system SHOULD allow the reviewer to collapse and resize the file list panel.

The system SHOULD apply syntax highlighting to diff content based on file extension.

The system MUST handle binary files by listing them in the change set but not allowing line-level comments on them.

The system MUST include untracked text files in the reviewable change set, treating them as fully added files.

The system MUST detect renamed files and present them with their old and new paths.

The system SHOULD provide a manual refresh control to reload the change list and comment counts from the repository.

## Version Changes

- 1.0: Added the initial requirements for local use, review of changes captured in a Git working directory, side-by-side and unified change views, line-level commenting, and text-form comment export for AI-agent processing.
- 1.1: Added requirements derived from the implemented feature set: comment editing and deletion, outdated-comment detection, configurable diff context, hide-removed-lines option, hierarchical file tree with collapsible folders and comment badges, resizable and collapsible file panel, syntax highlighting, binary file handling, untracked file inclusion, rename detection, and manual refresh.
