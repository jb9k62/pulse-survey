import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function runFilter(exception: unknown): Captured {
  const captured: Captured = { status: 0, body: {} };
  const json = vi.fn();
  const status = vi.fn((code: number) => {
    captured.status = code;
    return { json };
  });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/surveys' }),
    }),
  } as unknown as ArgumentsHost;

  json.mockImplementation((body: Record<string, unknown>) => {
    captured.body = body;
  });

  new HttpExceptionFilter().catch(exception, host);
  return captured;
}

describe('HttpExceptionFilter', () => {
  it('normalises an HttpException message to a string array', () => {
    const result = runFilter(new BadRequestException(['title: Too big']));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: ['title: Too big'],
      path: '/api/surveys',
    });
    expect(Array.isArray(result.body['message'])).toBe(true);
    expect(typeof result.body['timestamp']).toBe('string');
  });

  it('leaves an unmapped unique violation at 500: the filter knows no constraints', () => {
    const error = new DrizzleQueryError('insert', [], {
      code: '23505',
      constraint: 'surveys_one_active_per_org',
    } as unknown as Error);
    expect(runFilter(error).status).toBe(500);
  });

  it('answers a plain Error with 500 and no internals', () => {
    const result = runFilter(new Error('secret database detail'));
    expect(result.status).toBe(500);
    expect(result.body['message']).toEqual(['Internal server error']);
    expect(JSON.stringify(result.body)).not.toContain('secret database detail');
  });
});
