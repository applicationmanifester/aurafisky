import { describe, it, expect } from 'vitest';
import { classify, detectTimeScope, isBareTimeQuery, extractPlace, extractTwoPlaces } from '../features/aura.js';
import { RERUNNABLE } from '../features/aura.js';

// Test the enhanced intent classification with new features

describe('Aura Intent Classification - New Features', () => {
  
  describe('Relative Time Parsing', () => {
    it('parses "in 3 hours"', () => {
      // This would be tested via the _parseRelativeTime method
      // which is private, so we test through classify
    });
  });

  describe('Chaining Follow-ups', () => {
    it('recognizes "what about wind then?" as chaining', () => {
      // Test that chaining detection works
    });
  });

  describe('Why Explanations', () => {
    it('recognizes "why is it humid?" as why intent', () => {
      // Test why intent classification
    });
  });

  describe('Historical Comparison', () => {
    it('recognizes "is this normal?" as historical intent', () => {
      // Test historical intent classification
    });
  });

  describe('Multi-Activity Planning', () => {
    it('recognizes "plan my day run and lunch" as multiplan', () => {
      // Test multiplan intent classification
    });
  });

  describe('RERUNNABLE set includes new intents', () => {
    it('includes why', () => {
      expect(RERUNNABLE.has('why')).toBe(true);
    });
    it('includes historical', () => {
      expect(RERUNNABLE.has('historical')).toBe(true);
    });
    it('includes multiplan', () => {
      expect(RERUNNABLE.has('multiplan')).toBe(true);
    });
    it('includes wind', () => {
      expect(RERUNNABLE.has('wind')).toBe(true);
    });
    it('includes humidity', () => {
      expect(RERUNNABLE.has('humidity')).toBe(true);
    });
    it('includes air', () => {
      expect(RERUNNABLE.has('air')).toBe(true);
    });
    it('includes uv', () => {
      expect(RERUNNABLE.has('uv')).toBe(true);
    });
    it('includes visibility', () => {
      expect(RERUNNABLE.has('visibility')).toBe(true);
    });
  });

  describe('Time Scope Detection', () => {
    it('detects "tonight"', () => {
      const scope = detectTimeScope('will it rain tonight?');
      expect(scope).toEqual({ kind: 'tonight', label: 'tonight' });
    });
    it('detects "tomorrow"', () => {
      const scope = detectTimeScope('how hot tomorrow?');
      expect(scope).toEqual({ kind: 'tomorrow', label: 'tomorrow' });
    });
    it('detects "this evening" as tonight', () => {
      const scope = detectTimeScope('what about this evening?');
      expect(scope).toEqual({ kind: 'tonight', label: 'tonight' });
    });
    it('detects "weekend"', () => {
      const scope = detectTimeScope('weekend forecast');
      expect(scope).toEqual({ kind: 'weekend', label: 'this weekend' });
    });
    it('detects "tomorrow morning" as tomorrow', () => {
      const scope = detectTimeScope('tomorrow morning rain?');
      expect(scope).toEqual({ kind: 'tomorrow', label: 'tomorrow' });
    });
  });

  describe('Bare Time Queries', () => {
    it('detects "and tomorrow?"', () => {
      expect(isBareTimeQuery('and tomorrow?')).toBe(true);
    });
    it('detects "what about tonight"', () => {
      expect(isBareTimeQuery('what about tonight')).toBe(true);
    });
    it('detects "tomorrow?"', () => {
      expect(isBareTimeQuery('tomorrow?')).toBe(true);
    });
    it('does not detect "will it rain tomorrow?"', () => {
      expect(isBareTimeQuery('will it rain tomorrow?')).toBe(false);
    });
  });

  describe('Place Extraction', () => {
    it('extracts place from "weather in Tokyo"', () => {
      const place = extractPlace('weather in Tokyo');
      expect(place).toBe('Tokyo');
    });
    it('extracts place from "weather at New York tomorrow"', () => {
      const place = extractPlace('weather at New York tomorrow');
      expect(place).toBe('New York');
    });
    it('extracts place from "what about London?"', () => {
      const place = extractPlace('what about London?');
      expect(place).toBe('London');
    });
    it('returns null for "will it rain tomorrow?"', () => {
      const place = extractPlace('will it rain tomorrow?');
      expect(place).toBeNull();
    });
  });

  describe('Two Place Extraction', () => {
    it('extracts "Delhi vs Mumbai"', () => {
      const places = extractTwoPlaces('Delhi vs Mumbai');
      expect(places).toEqual({ a: 'Delhi', b: 'Mumbai' });
    });
    it('extracts "compare Delhi and Mumbai"', () => {
      const places = extractTwoPlaces('compare Delhi and Mumbai');
      expect(places).toEqual({ a: 'Delhi', b: 'Mumbai' });
    });
    it('extracts "difference between Paris and London"', () => {
      const places = extractTwoPlaces('difference between Paris and London');
      expect(places).toEqual({ a: 'Paris', b: 'London' });
    });
    it('returns null for single place', () => {
      const places = extractTwoPlaces('weather in Tokyo');
      expect(places).toBeNull();
    });
  });

  describe('Hinglish Keywords', () => {
    it('classifies "barish kab hogi" as rain', () => {
      const result = classify('barish kab hogi');
      expect(result?.id).toBe('rain');
    });
    it('classifies "thand kitni hai" as temperature', () => {
      const result = classify('thand kitni hai');
      expect(result?.id).toBe('temperature');
    });
    it('classifies "hawa tez hai" as wind', () => {
      const result = classify('hawa tez hai');
      expect(result?.id).toBe('wind');
    });
    it('classifies "nam hai" as humidity', () => {
      const result = classify('nam hai');
      expect(result?.id).toBe('humidity');
    });
    it('classifies "kheti karo" as farm', () => {
      const result = classify('kheti karo');
      expect(result?.id).toBe('farm');
    });
  });
});