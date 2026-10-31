# Contributing to Speech to Spec

Thank you for your interest in contributing to Speech to Spec!

## Development Guidelines

1. **Stack & Principles**:
   - Next.js 16 (Turbopack, App Router) and React 19.
   - Dark theme, single cyan accent (`#06b6d4`), monospace for identifiers, sans-serif prose.
   - **Accessibility**: All interactive elements must be keyboard accessible with visible focus rings.
   - **Responsiveness**: Everything must function cleanly down to 375px wide.
   - **Zero Logging Policy**: Never log raw transcripts, specifications, or API keys.

2. **Self-Correction Rule**:
   - In Speech to Spec, when a speaker revises their speech (e.g., *"actually"*, *"scratch that"*, *"instead"*), the last statement wins. Revisions are never reported as contradictions.

3. **Local Setup**:
   ```bash
   npm install
   cp .env.example .env.local
   npm run dev
   ```

4. **Verification**:
   Always verify the production build passes before submitting code:
   ```bash
   npm run build
   ```

5. **Submitting Changes**:
   - Open a descriptive Pull Request against `main`.
   - Ensure `npm run build` exits with code `0`.
   - Avoid adding unnecessary external runtime dependencies.

