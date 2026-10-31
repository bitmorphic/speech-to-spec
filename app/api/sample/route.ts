import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export async function GET() {
  const dataDir = path.resolve(process.cwd(), 'data');

  const possibleNames = [
    'sample-transcript.txt',
    'sample_transcript.txt',
    'sample transcript.txt',
  ];

  for (const name of possibleNames) {
    const fullPath = path.join(dataDir, name);
    if (fs.existsSync(fullPath)) {
      try {
        const transcript = fs.readFileSync(fullPath, 'utf8');
        return NextResponse.json({ transcript }, { status: 200 });
      } catch {
        return NextResponse.json(
          { error: 'Failed to read sample transcript file.' },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json(
    { error: 'Sample transcript not found in data directory.' },
    { status: 404 }
  );
}

