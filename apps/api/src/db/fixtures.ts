// The single source of fixture ids, all fixed literals. Nothing here generates a
// random id, so a re-run and a test can both name the same rows. Names are clearly
// fictional: no real people and no email addresses.

export type FixtureRole = 'manager' | 'member';
export type FixtureQuestionType = 'rating' | 'yes_no';
export type FixtureSurveyKey = 'active' | 'archived';
export type FixtureSurveyStatus = 'active' | 'archived';
export type FixtureQuestionKey = 'first' | 'second' | 'third';

export interface FixtureQuestion {
  id: string;
  position: 1 | 2 | 3;
  type: FixtureQuestionType;
  prompt: string;
}

export interface FixtureSurvey {
  id: string;
  title: string;
  status: FixtureSurveyStatus;
  questions: Record<FixtureQuestionKey, FixtureQuestion>;
}

export interface FixtureUser {
  id: string;
  name: string;
  role: FixtureRole;
}

export interface FixtureAnswer {
  id: string;
  question: FixtureQuestionKey;
  rating?: number;
  yesNo?: boolean;
}

export interface FixtureResponse {
  id: string;
  survey: FixtureSurveyKey;
  userId: string;
  answers: FixtureAnswer[];
}

export interface FixtureOrganisation {
  organisation: { id: string; name: string };
  users: {
    managerOne: FixtureUser;
    managerTwo: FixtureUser;
    memberLongAgo: FixtureUser;
    memberMidWeek: FixtureUser;
    memberDeactivatedBeforeWeek: FixtureUser;
    memberDeactivatedMidWeek: FixtureUser;
    // Active all week with no response, so a demo can sign in and submit.
    memberNotAnswered: FixtureUser;
  };
  surveys: {
    active: FixtureSurvey;
    archived?: FixtureSurvey;
  };
  responses: FixtureResponse[];
}

// `users` and `surveys` are built with small helpers so the literal ids stay
// readable; the values are still fixed, never generated.
function question(
  id: string,
  position: 1 | 2 | 3,
  type: FixtureQuestionType,
  prompt: string,
): FixtureQuestion {
  return { id, position, type, prompt };
}

function manager(id: string, name: string): FixtureUser {
  return { id, name, role: 'manager' };
}

function member(id: string, name: string): FixtureUser {
  return { id, name, role: 'member' };
}

function ratingAnswer(
  id: string,
  questionKey: FixtureQuestionKey,
  rating: number,
): FixtureAnswer {
  return { id, question: questionKey, rating };
}

function yesNoAnswer(
  id: string,
  questionKey: FixtureQuestionKey,
  yesNo: boolean,
): FixtureAnswer {
  return { id, question: questionKey, yesNo };
}

const acme: FixtureOrganisation = {
  organisation: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Acme Manufacturing',
  },
  users: {
    managerOne: manager(
      'a1000000-0000-4000-8000-000000000001',
      'Acme Manager One',
    ),
    managerTwo: manager(
      'a1000000-0000-4000-8000-000000000002',
      'Acme Manager Two',
    ),
    memberLongAgo: member(
      'a1000000-0000-4000-8000-000000000003',
      'Acme Member Long Ago',
    ),
    memberMidWeek: member(
      'a1000000-0000-4000-8000-000000000004',
      'Acme Member Mid Week',
    ),
    memberDeactivatedBeforeWeek: member(
      'a1000000-0000-4000-8000-000000000005',
      'Acme Member Deactivated Before Week',
    ),
    memberDeactivatedMidWeek: member(
      'a1000000-0000-4000-8000-000000000006',
      'Acme Member Deactivated Mid Week',
    ),
    memberNotAnswered: member(
      'a1000000-0000-4000-8000-000000000007',
      'Acme Member Not Answered',
    ),
  },
  surveys: {
    active: {
      id: 'a2000000-0000-4000-8000-000000000001',
      title: 'Acme weekly pulse',
      status: 'active',
      questions: {
        first: question(
          'a3000000-0000-4000-8000-000000000001',
          1,
          'rating',
          'How was your week?',
        ),
        second: question(
          'a3000000-0000-4000-8000-000000000002',
          2,
          'yes_no',
          'Did you get the support you needed?',
        ),
        third: question(
          'a3000000-0000-4000-8000-000000000003',
          3,
          'rating',
          'How clear were your priorities?',
        ),
      },
    },
  },
  responses: [
    {
      id: 'a4000000-0000-4000-8000-000000000001',
      survey: 'active',
      userId: 'a1000000-0000-4000-8000-000000000003',
      answers: [
        ratingAnswer('a5000000-0000-4000-8000-000000000001', 'first', 5),
        yesNoAnswer('a5000000-0000-4000-8000-000000000002', 'second', true),
        ratingAnswer('a5000000-0000-4000-8000-000000000003', 'third', 4),
      ],
    },
    {
      id: 'a4000000-0000-4000-8000-000000000002',
      survey: 'active',
      userId: 'a1000000-0000-4000-8000-000000000004',
      answers: [
        ratingAnswer('a5000000-0000-4000-8000-000000000004', 'first', 4),
        yesNoAnswer('a5000000-0000-4000-8000-000000000005', 'second', false),
        ratingAnswer('a5000000-0000-4000-8000-000000000006', 'third', 3),
      ],
    },
  ],
};

const blueRiver: FixtureOrganisation = {
  organisation: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Blue River Health',
  },
  users: {
    managerOne: manager(
      'b1000000-0000-4000-8000-000000000001',
      'Blue River Manager One',
    ),
    managerTwo: manager(
      'b1000000-0000-4000-8000-000000000002',
      'Blue River Manager Two',
    ),
    memberLongAgo: member(
      'b1000000-0000-4000-8000-000000000003',
      'Blue River Member Long Ago',
    ),
    memberMidWeek: member(
      'b1000000-0000-4000-8000-000000000004',
      'Blue River Member Mid Week',
    ),
    memberDeactivatedBeforeWeek: member(
      'b1000000-0000-4000-8000-000000000005',
      'Blue River Member Deactivated Before Week',
    ),
    memberDeactivatedMidWeek: member(
      'b1000000-0000-4000-8000-000000000006',
      'Blue River Member Deactivated Mid Week',
    ),
    memberNotAnswered: member(
      'b1000000-0000-4000-8000-000000000007',
      'Blue River Member Not Answered',
    ),
  },
  surveys: {
    active: {
      id: 'b2000000-0000-4000-8000-000000000001',
      title: 'Blue River weekly pulse',
      status: 'active',
      questions: {
        first: question(
          'b3000000-0000-4000-8000-000000000001',
          1,
          'rating',
          'How was your week?',
        ),
        second: question(
          'b3000000-0000-4000-8000-000000000002',
          2,
          'yes_no',
          'Did you get the support you needed?',
        ),
        third: question(
          'b3000000-0000-4000-8000-000000000003',
          3,
          'rating',
          'How clear were your priorities?',
        ),
      },
    },
    archived: {
      id: 'b2000000-0000-4000-8000-000000000002',
      title: 'Blue River onboarding pulse',
      status: 'archived',
      questions: {
        first: question(
          'b3100000-0000-4000-8000-000000000001',
          1,
          'rating',
          'How was your first month?',
        ),
        second: question(
          'b3100000-0000-4000-8000-000000000002',
          2,
          'yes_no',
          'Did your buddy check in?',
        ),
        third: question(
          'b3100000-0000-4000-8000-000000000003',
          3,
          'rating',
          'How useful was the induction?',
        ),
      },
    },
  },
  responses: [
    {
      id: 'b4000000-0000-4000-8000-000000000001',
      survey: 'active',
      userId: 'b1000000-0000-4000-8000-000000000003',
      answers: [
        ratingAnswer('b5000000-0000-4000-8000-000000000001', 'first', 5),
        yesNoAnswer('b5000000-0000-4000-8000-000000000002', 'second', true),
        ratingAnswer('b5000000-0000-4000-8000-000000000003', 'third', 4),
      ],
    },
  ],
};

export const fixtures = { acme, blueRiver } as const;
