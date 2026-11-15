// n8n Code node: "Build Request" (mode: run once for each item)
// Wraps one cleaned inquiry in a Gemini generateContent request.
// scripts/build_workflow.mjs swaps the SYSTEM_PROMPT placeholder for prompts/system_prompt.md.

const SYSTEM_PROMPT = __SYSTEM_PROMPT__;

const message = ($json.message ?? '').toString();

return {
  json: {
    ...$json,
    gemini_request: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `<inquiry>\n${message}\n</inquiry>` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            category: { type: 'STRING', enum: ['buyer', 'renter', 'seller', 'agent', 'spam', 'other'] },
            urgency: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            summary: { type: 'STRING' },
            property_mentioned: { type: 'STRING', nullable: true },
            draft_reply: { type: 'STRING' },
            needs_human: { type: 'BOOLEAN' },
          },
          required: ['category', 'urgency', 'summary', 'property_mentioned', 'draft_reply', 'needs_human'],
        },
      },
    },
  },
};
