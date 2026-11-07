// Client for the `ai` edge function (supabase/functions/ai). Never throws: returns {ai:false} on any failure
// so every caller can fall back to the built-in rules.
import { sb } from './supabase.js';
import { state } from '../state.js';

export async function ai(body) {
  try {
    const { data, error } = await sb.functions.invoke('ai', { body });
    if (error) return { ai: false };
    return data || { ai: false };
  } catch {
    return { ai: false };
  }
}

export const aiChip = () =>
  `<span class="aichip ${state.AI ? 'on' : ''}" title="${state.AI ? 'Claude-powered AI is on' : 'Running on built-in smart rules'}"><i></i>${state.AI ? 'AI on' : 'Smart mode'}</span>`;

export async function checkAI() {
  const r = await ai({ mode: 'ping' });
  state.AI = !!r.ai;
  document.querySelectorAll('.aichip:not(.fixed)').forEach((e) => { e.outerHTML = aiChip(); });
}
