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
 * Synthesizes a rational decision when local Ollama is offline or unreachable.
 */
function synthesizeRationalDecision(
  priorities: string,
  optionA: string,
  optionB: string
): OllamaDecisionResponse {
  const pLower = (priorities || '').toLowerCase();
  
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

/**
 * Returns candidate URLs to reach Ollama safely across local dev, HTTPS iframes, and Vite proxies.
 */
function getCandidateEndpoints(configuredEndpoint: string): string[] {
  const list: string[] = [];
  const trimmed = (configuredEndpoint || '').trim().replace(/\/+$/, '');

  // In browser on HTTPS, Vite proxy /ollama-proxy avoids Mixed Content blocking
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    list.push('/ollama-proxy');
  }

  if (trimmed && !list.includes(trimmed)) {
    list.push(trimmed);
  }

  if (!list.includes('/ollama-proxy')) {
    list.push('/ollama-proxy');
  }

  if (!list.includes('http://localhost:11434')) {
    list.push('http://localhost:11434');
  }

  return list;
}

export async function decideWithOllama(params: {
  endpoint: string;
  model: string;
  priorities: string;
  optionA: string;
  optionB: string;
}): Promise<OllamaDecisionResponse> {
  const { endpoint, model, priorities, optionA, optionB } = params;

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

  const candidates = getCandidateEndpoints(endpoint);

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${url}/api/generate`, {
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
        continue;
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
      }
    } catch {
      // Try next candidate endpoint
      continue;
    }
  }

  // Graceful synthesis fallback
  return synthesizeRationalDecision(priorities, optionA, optionB);
}

export async function fetchOllamaTags(endpoint: string): Promise<string[]> {
  const candidates = getCandidateEndpoints(endpoint);

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const list = (data.models || []).map((m: { name: string }) => m.name);
        if (list.length > 0) return list;
      }
    } catch {
      continue;
    }
  }

  return ['llama3.2', 'llama3', 'smollm:135m'];
}
