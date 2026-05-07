---
name: doc-coauthoring
description: "Collaborative document creation through three structured stages: Context Gathering, Refinement & Structure, and Reader Testing."
risk: unknown
source: community
date_added: "2026-02-27"
---

# Doc Co-Authoring Workflow

## Overview

Guides collaborative document creation through three structured stages: Context Gathering, Refinement & Structure, and Reader Testing.

## Use this skill when

Users mention: "write a doc", "draft a proposal", "create a spec", or reference specific document types like PRDs, design docs, or RFCs.

## Three-Stage Process

### Stage 1: Context Gathering

Closes knowledge gaps between user and Claude through meta-questions about:
- Document type
- Audience
- Desired impact
- Templates
- Constraints

Users can info-dump context freely, with clarifying questions generated once initial information is provided.

### Stage 2: Refinement & Structure

Builds the document section-by-section using:
1. Clarifying questions
2. Brainstorming 5-20 options
3. Curation
4. Gap checking
5. Drafting
6. Iterative refinement

Start with whichever section has the most unknowns.

### Stage 3: Reader Testing

Tests whether the document works for fresh readers without author context:
- Predict reader questions
- Use sub-agents (if available) or have users test manually in a separate Claude session

## Notable Features

- Emphasizes surgical edits via `str_replace` rather than reprinting full documents
- Recommends leaving summary sections for last
- Includes quality checks after three iterations with minimal changes
- Suggests comprehensive final review before completion

The skill prioritizes creating documents that function effectively when readers—including those pasting content into Claude—encounter them independently.
