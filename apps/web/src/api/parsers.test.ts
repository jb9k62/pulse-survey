import { describe, expect, it } from 'vitest';
import {
  errorMessage,
  parseActiveSurvey,
  parseDevUsers,
  parseSessionState,
  parseSubmitResponse,
  parseSummary,
  parseSurveyList,
} from './parsers.js';

const week = {
  start: '2026-09-21',
  end: '2026-09-27',
  label: 'Mon 21 Sep to Sun 27 Sep',
};

describe('parseSessionState', () => {
  it('accepts a signed-in session', () => {
    const value = {
      signedIn: true,
      user: { id: 'u1', name: 'Ada' },
      organisation: { id: 'o1', name: 'Acme' },
      role: 'member',
      devSignIn: true,
    };
    expect(parseSessionState(value)).toEqual(value);
  });

  it('accepts a signed-out session', () => {
    const value = {
      signedIn: false,
      user: null,
      organisation: null,
      role: null,
      devSignIn: false,
    };
    expect(parseSessionState(value)).toEqual(value);
  });

  it('rejects signedIn true with a null user', () => {
    expect(() =>
      parseSessionState({
        signedIn: true,
        user: null,
        organisation: { id: 'o1', name: 'Acme' },
        role: 'member',
        devSignIn: true,
      }),
    ).toThrow(/user/);
  });

  it('rejects signedIn false with a non-null user', () => {
    expect(() =>
      parseSessionState({
        signedIn: false,
        user: { id: 'u1', name: 'Ada' },
        organisation: null,
        role: null,
        devSignIn: true,
      }),
    ).toThrow(/SessionState: user:/);
  });
});

describe('parseDevUsers', () => {
  it('accepts a users wrapper', () => {
    const users = [
      {
        id: 'u1',
        name: 'Ada',
        role: 'manager',
        organisation: { id: 'o1', name: 'Acme' },
      },
    ];
    expect(parseDevUsers({ users })).toEqual(users);
  });

  it('rejects an unknown role', () => {
    expect(() =>
      parseDevUsers({
        users: [
          {
            id: 'u1',
            name: 'Ada',
            role: 'owner',
            organisation: { id: 'o1', name: 'Acme' },
          },
        ],
      }),
    ).toThrow(/role/);
  });
});

describe('parseActiveSurvey', () => {
  it('accepts an empty payload', () => {
    const value = { survey: null, week, hasRespondedThisWeek: false };
    expect(parseActiveSurvey(value)).toEqual(value);
  });

  it('accepts a full survey', () => {
    const value = {
      survey: {
        id: 's1',
        title: 'Weekly pulse',
        status: 'active',
        questions: [
          { id: 'q1', position: 1, type: 'rating', prompt: 'How are you?' },
          { id: 'q2', position: 2, type: 'yes_no', prompt: 'Did you rest?' },
        ],
      },
      week,
      hasRespondedThisWeek: true,
    };
    expect(parseActiveSurvey(value)).toEqual(value);
  });

  it('rejects a missing week label', () => {
    expect(() =>
      parseActiveSurvey({
        survey: null,
        week: { start: '2026-09-21', end: '2026-09-27' },
        hasRespondedThisWeek: false,
      }),
    ).toThrow(/week\.label/);
  });
});

describe('parseSubmitResponse', () => {
  it('accepts the submit payload', () => {
    const value = { response: { id: 'r1', week } };
    expect(parseSubmitResponse(value)).toEqual(value);
  });

  it('rejects a numeric response id', () => {
    expect(() => parseSubmitResponse({ response: { id: 7, week } })).toThrow(
      /id/,
    );
  });
});

describe('errorMessage', () => {
  it('joins a message array with a semicolon', () => {
    expect(errorMessage({ message: ['first', 'second'] })).toBe(
      'first; second',
    );
  });

  it('tolerates a bare string', () => {
    expect(errorMessage({ message: 'only one' })).toBe('only one');
  });

  it('returns null for an unknown shape', () => {
    expect(errorMessage({ message: [1, 2] })).toBeNull();
    expect(errorMessage('nope')).toBeNull();
  });
});

describe('parseSurveyList', () => {
  it('accepts a surveys wrapper', () => {
    const surveys = [
      {
        id: 's1',
        title: 'Weekly pulse',
        status: 'active',
        questionCount: 3,
        weekStart: '2026-09-21',
      },
    ];
    expect(parseSurveyList({ surveys })).toEqual(surveys);
  });

  it('rejects an unknown status', () => {
    expect(() =>
      parseSurveyList({
        surveys: [
          {
            id: 's1',
            title: 'Weekly pulse',
            status: 'draft',
            questionCount: 3,
            weekStart: '2026-09-21',
          },
        ],
      }),
    ).toThrow(/status/);
  });

  it('rejects a missing weekStart', () => {
    expect(() =>
      parseSurveyList({
        surveys: [
          {
            id: 's1',
            title: 'Weekly pulse',
            status: 'active',
            questionCount: 3,
          },
        ],
      }),
    ).toThrow(/weekStart/);
  });
});

describe('parseSummary', () => {
  const summary = {
    survey: { id: 's1', title: 'Weekly pulse', status: 'active' },
    week,
    completion: { completed: 2, eligible: 3, rate: 0.6666666666666666 },
    questions: [
      {
        id: 'q1',
        position: 1,
        type: 'rating',
        prompt: 'How are you?',
        average: null,
        count: 0,
      },
      {
        id: 'q2',
        position: 2,
        type: 'yes_no',
        prompt: 'Did you rest?',
        yes: 1,
        no: 1,
      },
    ],
  };

  it('accepts the worked example, including a null average with count 0', () => {
    expect(parseSummary(summary)).toEqual(summary);
  });

  it('rejects a non-finite rate', () => {
    expect(() =>
      parseSummary({
        ...summary,
        completion: { completed: 2, eligible: 3, rate: Number.NaN },
      }),
    ).toThrow(/rate/);
  });

  it('rejects a non-finite average', () => {
    expect(() =>
      parseSummary({
        ...summary,
        questions: [
          {
            id: 'q1',
            position: 1,
            type: 'rating',
            prompt: 'How are you?',
            average: Number.NaN,
            count: 2,
          },
        ],
      }),
    ).toThrow(/average/);
  });

  it('rejects a rating question missing count', () => {
    expect(() =>
      parseSummary({
        ...summary,
        questions: [
          {
            id: 'q1',
            position: 1,
            type: 'rating',
            prompt: 'How are you?',
            average: 4.5,
          },
        ],
      }),
    ).toThrow(/count/);
  });
});
