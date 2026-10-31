import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loadAllCaseStudies } from '@/lib/cases';
import { ProofCaseStudies } from '@/components/ProofCaseStudies';

export const metadata = {
  title: 'Proof | Speech to Spec',
  description: 'Real case studies and empirical metrics from speech-to-spec sessions',
};

function checkVoiceInsightsImage(): { src: string; caption: string } | null {
  const publicDir = path.join(process.cwd(), 'public');
  const candidates = [
    { filePath: path.join(publicDir, 'proofs', 'whisper insights.png'), publicUrl: '/proofs/whisper%20insights.png' },
    { filePath: path.join(publicDir, 'proof', 'whisper insights.png'), publicUrl: '/proof/whisper%20insights.png' },
    { filePath: path.join(publicDir, 'proofs', 'wispr-insights.png'), publicUrl: '/proofs/wispr-insights.png' },
    { filePath: path.join(publicDir, 'proof', 'wispr-insights.png'), publicUrl: '/proof/wispr-insights.png' },
  ];

  for (const c of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ c.filePath)) {
      return {
        src: c.publicUrl,
        caption: 'Wispr Flow insights from the challenge.',
      };
    }
  }

  return null;
}

function loadRealProofComparison(): any | null {
  const proofJsonPath = path.join(process.cwd(), 'data', 'proof.json');
  if (fs.existsSync(/*turbopackIgnore: true*/ proofJsonPath)) {
    try {
      const content = fs.readFileSync(proofJsonPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed?.rawTranscript && parsed?.lintedSpec) {
        return parsed;
      }
    } catch {
      // Ignore invalid JSON
    }
  }
  return null;
}

export default function ProofPage() {
  const cases = loadAllCaseStudies();

  // If there are no valid cases, make the /proof route return a not found page.
  if (cases.length === 0) {
    notFound();
  }

  const voiceInsightsImage = checkVoiceInsightsImage();
  const buildComparison = loadRealProofComparison();

  return (
    <div className="min-h-screen bg-[#F8F8F7] text-[#1B1B18] flex flex-col font-sans">
      <AppHeader showProof={true} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <ProofCaseStudies
          cases={cases}
          voiceInsightsImage={voiceInsightsImage}
          buildComparison={buildComparison}
        />
      </main>
    </div>
  );
}
