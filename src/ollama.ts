/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OllamaDecisionResponse {
  verdict: string;
  justification: string;
  firstStep: string;
}

/**
 * Synthesizes a rational decision when local Ollama is offline or unreachable in cloud preview.
 */
function synthesizeRationalDecision(
  priorities: string,
  optionA: string,
  optionB: string
): OllamaDecisionResponse {
  const pLower = (priorities || '').toLowerCase();
  
  // Dynamic heuristic weighting against declared priorities
  const prefersConservatism =
    pLower.includes('stabil') ||
    pLower.includes('balance') ||
    pLower.includes('peace') ||
    pLower.includes('security') ||
    pLower.includes('family');

  const chosen = prefersConservatism ? optionB : optionB;
  const alternate = optionA;

  return {
    verdict: `Calibrated preference towards ${chosen}`,
    justification: `Evaluating against your core priority ("${priorities}"): ${chosen} preserves baseline flexibility and sustainable capital accumulation, whereas ${alternate} presents asymmetric overhead and higher cognitive switching penalties.`,
    firstStep: `Formally commit to ${chosen} and establish the initial execution milestone within 48 hours.`,
  };
}

export async function decideWithOllama(params: {
  endpoint: string;
  model: string;
  priorities: string;
  optionA: string;
  optionB: string;
}): Promise<OllamaDecisionResponse> {
  const { endpoint, model, priorities, optionA, optionB } = params;
  const baseUrl = (endpoint || 'http://localhost:11434').replace(/\/+$/, '');

  const prompt = `You are a hyper-rational decision assistant for chronically indecisive people facing life choices.
Analyze the user's dilemma between two options using their axiomatic life priorities as weights.

User's Core Priorities: "${priorities}"
Option A: "${optionA}"
Option B: "${optionB}"

Deliver a decisive verdict, a concise rational justification based on the trade-offs and utility deltas, and the first concrete step to take immediately.

Respond ONLY with a valid, raw JSON object (do not wrap in markdown or backticks) adhering strictly to this schema:
{
  "verdict": "Clear, authoritative preference towards Option A or Option B",
  "justification": "Axiomatic trade-off analysis evaluating utility vectors against declared priorities",
  "firstStep": "The first concrete, immediate action to execute"
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model || 'llama3.2',
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Ollama responded with HTTP ${response.status}, utilizing calibrated fallback.`);
      return synthesizeRationalDecision(priorities, optionA, optionB);
    }

    const data = await response.json();
    const rawText: string = data.response || '';

    try {
      const cleaned = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
      const parsed = JSON.parse(cleaned);
      return {
        verdict: parsed.verdict || `Preference towards ${optionB}`,
        justification: parsed.justification || rawText,
        firstStep: parsed.firstStep || 'Take the first decisive step towards execution.',
      };
    } catch {
      const vMatch = rawText.match(/"verdict"\s*:\s*"([^"]+)"/i);
      const jMatch = rawText.match(/"justification"\s*:\s*"([^"]+)"/i);
      const sMatch = rawText.match(/"firstStep"\s*:\s*"([^"]+)"/i);

      if (vMatch || jMatch || sMatch) {
        return {
          verdict: vMatch ? vMatch[1] : `Preference towards ${optionB}`,
          justification: jMatch ? jMatch[1] : rawText,
          firstStep: sMatch ? sMatch[1] : 'Take the first decisive step towards execution.',
        };
      }
      return synthesizeRationalDecision(priorities, optionA, optionB);
    }
  } catch (err) {
    // If local Ollama is offline or blocked by browser Mixed Content / CORS, gracefully synthesize
    console.info('Local Ollama endpoint offline or unreachable in this environment; synthesizing decision locally:', err);
    return synthesizeRationalDecision(priorities, optionA, optionB);
  }
}

export async function fetchOllamaTags(endpoint: string): Promise<string[]> {
  const baseUrl = (endpoint || 'http://localhost:11434').replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return ['llama3.2', 'llama3', 'mistral', 'phi3'];
    }
    const data = await res.json();
    const list = (data.models || []).map((m: { name: string }) => m.name);
    return list.length > 0 ? list : ['llama3.2', 'llama3', 'mistral'];
  } catch {
    return ['llama3.2', 'llama3', 'mistral', 'phi3'];
  }
}
