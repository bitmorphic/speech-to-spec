import { JsonSchemaObject } from './schema';

export const specResponseSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Technical specification document generated from speech transcript and resolved answers.',
  properties: {
    answerConflicts: {
      type: 'array',
      description: 'Pairs or sets of chosen answers that conflict with each other or with transcript requirements.',
      items: {
        type: 'object',
        properties: {
          questionIds: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of question IDs that participate in this conflict.',
          },
          description: {
            type: 'string',
            description: 'Why these chosen answers cannot both be true.',
          },
          suggestedFix: {
            type: 'string',
            description: 'Concrete suggested resolution or tradeoff.',
          },
        },
        required: ['questionIds', 'description', 'suggestedFix'],
        additionalProperties: false,
      },
    },
    specMarkdown: {
      type: 'string',
      description: 'Comprehensive, structured specification markdown document with all required sections.',
    },
  },
  required: ['answerConflicts', 'specMarkdown'],
  additionalProperties: false,
};
