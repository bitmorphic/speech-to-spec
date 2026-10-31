import { NextResponse } from 'next/server';
import { loadAllCaseStudies } from '@/lib/cases';

export async function GET() {
  const cases = loadAllCaseStudies();
  return NextResponse.json({
    hasCases: cases.length > 0,
    count: cases.length,
  });
}

