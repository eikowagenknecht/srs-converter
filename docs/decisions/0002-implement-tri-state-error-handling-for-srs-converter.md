# Implement Tri-State Error Handling for SRS Converter

## Context and Problem Statement

The SRS converter package needs to handle data conversion errors gracefully when importing from external formats like Anki.
Users have different needs: some want strict validation that fails on any data issues, while others prefer best-effort conversion that recovers as much data as possible.
Simple error handling approaches like console.error or throwing exceptions cannot support both use cases effectively.

## Considered Options

* console.error() for logging errors
* throw exceptions on any error
* Tri-state success model with comprehensive error collection

## Decision Outcome

Chosen option: "Tri-state success model with comprehensive error collection", because it supports both strict and best-effort conversion modes while providing complete visibility into all data issues, enabling users to make informed decisions about their converted data.

### Consequences

* Good, because users get choice between strict validation and best-effort recovery.
* Good, because partial success allows working with converted data while addressing issues.
* Good, because comprehensive error collection shows all issues, not just the first one.
* Good, because structured error context includes user-friendly identifiers and recovery suggestions.
* Bad, because increased complexity in error handling logic.
* Bad, because performance impact from continuing processing after errors.
