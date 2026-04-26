import { describe, expect, it } from 'vitest';
import { listAgentTools } from './index';

describe('listAgentTools', () => {
  it('returns every registered tool with a unique name', () => {
    const tools = listAgentTools();
    const names = tools.map((t) => t.tool.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
    expect(names).toContain('search_signals');
    expect(names).toContain('cluster_references');
    expect(names).toContain('generate_image');
    expect(names).toContain('analyze_video');
    expect(names).toContain('get_current_datetime');
  });

  it('every tool exposes a non-empty Anthropic SDK Tool shape', () => {
    for (const t of listAgentTools()) {
      expect(typeof t.tool.name).toBe('string');
      expect(t.tool.name.length).toBeGreaterThan(0);
      expect(typeof t.tool.description).toBe('string');
      expect(t.tool.description!.length).toBeGreaterThan(0);
      expect(t.tool.input_schema).toBeDefined();
    }
  });

  it('every tool has either a path (HTTP) or a local handler — never neither', () => {
    for (const t of listAgentTools()) {
      const hasPath = typeof t.dispatch.path === 'string';
      const hasLocal = typeof t.dispatch.local === 'function';
      expect(hasPath || hasLocal).toBe(true);
    }
  });

  it('dispatch carries provider + model + registryId for ledger attribution', () => {
    for (const t of listAgentTools()) {
      expect(typeof t.dispatch.registryId).toBe('string');
      expect(t.dispatch.registryId.length).toBeGreaterThan(0);
      expect(typeof t.dispatch.provider).toBe('string');
      expect(typeof t.dispatch.model).toBe('string');
    }
  });
});
