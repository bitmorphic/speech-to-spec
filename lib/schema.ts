export interface JsonSchemaObject {
  [key: string]: unknown;
  type: 'object';
  description?: string;
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export const lintResponseSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Structured linting analysis of the speech transcript.',
  properties: {
    analysis: {
      type: 'object',
      description: 'Initial breakdown of speaker constraints and requirements before deriving contradictions.',
      properties: {
        constraints: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Every limit the speaker states, such as no login, browser-only storage, no database, and offline.',
        },
        requirements: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Every distinct feature or rule the speaker asks for.',
        },
      },
      required: ['constraints', 'requirements'],
      additionalProperties: false,
    },
    summary: {
      type: 'string',
      description: 'Concise summary of the transcript and intent.',
    },
    selfCorrections: {
      type: 'array',
      description: 'Corrections where the speaker revised an earlier statement (e.g. actually, no wait, scratch that).',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier, e.g. sc-1',
          },
          earlierQuote: {
            type: 'string',
            description: 'Verbatim substring of the earlier statement before revision (at most 25 words)',
          },
          finalQuote: {
            type: 'string',
            description: 'Verbatim substring of the revised statement that wins (at most 25 words)',
          },
          resolution: {
            type: 'string',
            description: 'Explanation of how the speaker corrected themselves and what was resolved',
          },
        },
        required: ['id', 'earlierQuote', 'finalQuote', 'resolution'],
        additionalProperties: false,
      },
    },
    contradictions: {
      type: 'array',
      description: 'Two statements both still in force that cannot both hold or force a hidden tradeoff.',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier, e.g. c-1',
          },
          severity: {
            type: 'string',
            enum: ['high', 'medium'],
            description: 'Severity level: high or medium',
          },
          quoteA: {
            type: 'string',
            description: 'Verbatim substring of the first statement (at most 25 words)',
          },
          quoteB: {
            type: 'string',
            description: 'Verbatim substring of the conflicting statement (at most 25 words)',
          },
          why: {
            type: 'string',
            description: 'Why these two statements contradict or force a hidden tradeoff',
          },
        },
        required: ['id', 'severity', 'quoteA', 'quoteB', 'why'],
        additionalProperties: false,
      },
    },
    missingDecisions: {
      type: 'array',
      description: 'Architectural or implementation decisions that the transcript does not settle.',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier, e.g. md-1',
          },
          topic: {
            type: 'string',
            description: 'Area of the missing decision, such as storage, authentication, limits, time zones',
          },
          whyItMatters: {
            type: 'string',
            description: 'Why an implementer needs this decision and how it impacts architecture',
          },
        },
        required: ['id', 'topic', 'whyItMatters'],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      description: 'Three to five questions ordered by impact, each answerable in one sentence, each tied to a finding, with 2 to 3 options.',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier, e.g. q-1',
          },
          question: {
            type: 'string',
            description: 'Question answerable in one sentence',
          },
          relatesTo: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of finding IDs (from contradictions or missingDecisions)',
          },
          options: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Two to three concrete options for resolving the question',
          },
        },
        required: ['id', 'question', 'relatesTo', 'options'],
        additionalProperties: false,
      },
    },
  },
  required: ['analysis', 'summary', 'selfCorrections', 'contradictions', 'missingDecisions', 'questions'],
  additionalProperties: false,
};
