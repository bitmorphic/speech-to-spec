import React from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

export const metadata = {
  title: 'About | Speech to Spec',
  description: 'How the Speech to Spec requirements linter works, architecture, and principles',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-10">
        {/* Hero Section */}
        <div className="flex flex-col gap-3 border-b border-zinc-800 pb-8">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-400 font-semibold border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 rounded">
              DOCUMENTATION &amp; ARCHITECTURE
            </span>
            <span className="text-xs font-mono text-zinc-500">v0.1.0</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            About Speech to Spec
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl font-sans">
            A voice-to-build workspace designed to bridge the gap between stream-of-consciousness spoken feature ideas and rigorous, deterministic specifications ready for coding agents.
          </p>
        </div>

        {/* Section 1: How the Toolbox Works */}
        <section aria-labelledby="toolbox-heading" className="flex flex-col gap-4">
          <h2 id="toolbox-heading" className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-4 bg-cyan-500 rounded-full" />
            How the Toolbox Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col gap-2">
              <span className="font-mono text-xs text-cyan-400 font-semibold">1. Instant Hints (Local)</span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                As you type or dictate, a client-side regex engine highlights revisions, constraints (offline, no database, free), identity requirements, and automated triggers in real time before sending a single token.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col gap-2">
              <span className="font-mono text-xs text-cyan-400 font-semibold">2. Structured Linter (Groq AI)</span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Transcripts are analyzed by Groq using strict JSON schema outputs to extract verified quotes, classify contradictions, and uncover missing architectural and product decisions.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col gap-2">
              <span className="font-mono text-xs text-cyan-400 font-semibold">3. Clarification &amp; Readiness</span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                A heuristic spec-readiness gauge dynamically calculates clarity based on open contradictions. Concrete multiple-choice questions allow you to resolve ambiguities or delegate decisions.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col gap-2">
              <span className="font-mono text-xs text-cyan-400 font-semibold">4. Build Pack &amp; Verification</span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Generates complete 12-section markdown specifications with decisions logs, BDD test suites, Mermaid flowcharts, entity-relationship diagrams, and prompt packs for Antigravity, Cursor, and Claude Code.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Core Principle: Self-Correction is Never a Contradiction */}
        <section aria-labelledby="rules-heading" className="p-5 rounded-lg border border-cyan-900/50 bg-cyan-950/20 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 id="rules-heading" className="text-sm font-bold uppercase tracking-wider text-cyan-300 font-mono">
              Core Rule: Self-Correction is Never a Contradiction
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
            When humans speak, they frequently revise themselves mid-thought with phrases like <em>&quot;actually&quot;</em>, <em>&quot;no wait&quot;</em>, <em>&quot;scratch that&quot;</em>, <em>&quot;on second thought&quot;</em>, or <em>&quot;instead&quot;</em>.
          </p>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
            In standard analysis tools, this is mistakenly flagged as a contradiction. In Speech to Spec, our strict semantic rules enforce that <strong>the later statement always wins</strong>. Previous superseded phrases are logged under Self-Corrections and excluded from contradiction checks, preventing false alarms and wasted questions.
          </p>
        </section>

        {/* Section 3: Privacy and Browser Storage */}
        <section aria-labelledby="privacy-heading" className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
          <h2 id="privacy-heading" className="text-base font-semibold text-zinc-100 tracking-tight">
            Privacy &amp; Data Locality
          </h2>
          <ul className="list-disc list-outside space-y-2 text-xs sm:text-sm text-zinc-300 pl-5 leading-relaxed font-sans">
            <li>
              <strong>AI Analysis:</strong> When you run Lint, Generate Spec, Tests, or Diagrams, the transcript or specification is sent securely to Groq for model inference using strict JSON schema validation.
            </li>
            <li>
              <strong>Sessions Stay in This Browser:</strong> Your session history (transcripts, lint findings, chosen answers, and generated specifications) is saved exclusively in your browser&apos;s local storage. No user accounts, database tracking, or centralized logging exists.
            </li>
            <li>
              <strong>BYOK Key Isolation:</strong> If you supply your own Groq API key in the Settings drawer, it is stored in volatile tab memory only. It is never written to disk, cookies, or the URL, is sent directly in request headers, is never logged on the server, and is never returned in any response.
            </li>
          </ul>
        </section>

        {/* Section 4: Open Source & Independence */}
        <section aria-labelledby="oss-heading" className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
          <h2 id="oss-heading" className="text-base font-semibold text-zinc-100 tracking-tight">
            Open Source &amp; Independence
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
            Speech to Spec is free, open source software licensed under the{' '}
            <strong className="text-cyan-400 font-mono">MIT License</strong>. You can inspect the source code, fork the repository, run it locally, and deploy it to your own infrastructure.
          </p>
          <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 leading-relaxed font-mono">
            <strong>Disclaimer:</strong> Speech to Spec is completely independent and is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Wispr Flow, Wispr Technologies, or any of their subsidiaries or affiliates.
          </div>
        </section>

        {/* Back Link */}
        <div className="pt-4 border-t border-zinc-800 flex justify-between items-center text-xs font-mono">
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition">
            &larr; Back to Workspace
          </Link>
          <Link href="/proof" className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition">
            View Empirical Proof &rarr;
          </Link>
        </div>
      </main>
    </div>
  );
}

