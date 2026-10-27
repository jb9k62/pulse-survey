import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  completionOf,
  EMPTY_TALLY,
  ratingOf,
  yesNoOf,
  type QuestionTally,
} from '../src/surveys/summary.math.js';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * The TypeScript compiler API, not a regex over the text: a regex false-positives on
 * import specifiers and file paths in comments.
 */
function divisionCount(filePath: string): number {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
  );
  let divisions = 0;
  const walk = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.SlashToken
    ) {
      divisions += 1;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  return divisions;
}

const tally = (overrides: Partial<QuestionTally>): QuestionTally => ({
  ...EMPTY_TALLY,
  ...overrides,
});

describe('summary maths', () => {
  describe('completionOf', () => {
    it('returns a null rate when there are no eligible members', () => {
      expect(completionOf(0, 0)).toEqual({
        completed: 0,
        eligible: 0,
        rate: null,
      });
    });

    it('returns a zero rate when nobody answered', () => {
      const result = completionOf(0, 3);
      expect(result.rate).toBe(0);
      expect(result.rate).not.toBeNull();
      expect(Number.isNaN(result.rate)).toBe(false);
    });

    it('returns the fraction, not a percentage', () => {
      expect(completionOf(2, 3).rate).toBe(0.6666666666666666);
      expect(completionOf(3, 3).rate).toBe(1);
    });

    it('never exceeds 1 and never returns NaN', () => {
      const pairs: Array<[number, number]> = [
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2],
        [0, 7],
        [7, 7],
      ];
      for (const [completed, eligible] of pairs) {
        const { rate } = completionOf(completed, eligible);
        expect(rate).toBeLessThanOrEqual(1);
        expect(Number.isNaN(rate)).toBe(false);
      }
    });
  });

  describe('ratingOf', () => {
    it('returns null average and zero count for the unanswered question', () => {
      expect(ratingOf(EMPTY_TALLY)).toEqual({ average: null, count: 0 });
    });

    it('converts the string average PostgreSQL returns', () => {
      const result = ratingOf(
        tally({
          ratingAverage: '4.5000000000000000',
          ratingCount: 2,
          yesCount: 0,
          noCount: 0,
        }),
      );
      expect(result).toEqual({ average: 4.5, count: 2 });
    });

    it('keeps the count but drops a non-numeric or null average, never NaN', () => {
      for (const raw of [null, 'not-a-number']) {
        const result = ratingOf(tally({ ratingAverage: raw, ratingCount: 2 }));
        expect(result).toEqual({ average: null, count: 2 });
        expect(Number.isNaN(result.average)).toBe(false);
      }
    });
  });

  describe('yesNoOf', () => {
    it('returns zero counts for the unanswered question', () => {
      expect(yesNoOf(EMPTY_TALLY)).toEqual({ yes: 0, no: 0 });
    });

    it('passes the counts through', () => {
      expect(yesNoOf(tally({ yesCount: 1, noCount: 1 }))).toEqual({
        yes: 1,
        no: 1,
      });
    });
  });

  it('is the only module in src that divides', () => {
    const dividing = sourceFiles(SRC_ROOT)
      .filter((file) => divisionCount(file) > 0)
      .map((file) => relative(SRC_ROOT, file));

    // The equality is non-vacuous: it fails if summary.math.ts stops dividing too.
    expect(dividing).toEqual(['surveys/summary.math.ts']);
  });
});
