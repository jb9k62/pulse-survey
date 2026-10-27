/**
 * The Member flow: load the active survey, render one field per question, and
 * submit. The week label always comes from the server; the client never
 * computes or formats a week.
 *
 * The form uses `useActionState` and `useFormStatus`. Every failure is returned
 * as a value, never thrown, because a throw inside the action would cancel the
 * action queue and reach the ErrorBoundary.
 *
 * Once this visit's submit is answered (recorded, or a 409 duplicate), the
 * form is disabled: the outcome is newer than the `hasRespondedThisWeek` read
 * on load. That is a courtesy only; the database enforces one response a week.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AnswerInput } from '@pulse/contracts';
import { getActiveSurvey, submitResponse } from '../api/client.js';
import QuestionField from '../components/QuestionField.js';
import { useApiResult } from '../hooks/useApiResult.js';

type SubmitOutcome =
  | { kind: 'idle' }
  | { kind: 'submitted'; message: string }
  | { kind: 'duplicate' }
  | { kind: 'invalid'; message: string }
  | { kind: 'error'; message: string };

const FALLBACK_MESSAGE = 'Could not submit your answers. Try again.';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending || disabled}>
      Submit answers
    </button>
  );
}

export default function MemberScreen() {
  const load = useApiResult({ key: 'active-survey', load: getActiveSurvey });

  async function submit(
    _previous: SubmitOutcome,
    formData: FormData,
  ): Promise<SubmitOutcome> {
    if (load.status !== 'ready' || load.value.survey === null) {
      return { kind: 'error', message: FALLBACK_MESSAGE };
    }

    const survey = load.value.survey;
    const answers: AnswerInput[] = [];
    for (const question of survey.questions) {
      const value = formData.get(question.id);
      if (typeof value !== 'string') {
        return {
          kind: 'invalid',
          message: 'Answer every question before submitting.',
        };
      }
      if (question.type === 'rating') {
        answers.push({ questionId: question.id, rating: Number(value) });
      } else {
        answers.push({ questionId: question.id, yesNo: value === 'yes' });
      }
    }

    const result = await submitResponse(survey.id, answers);
    if (result.ok) {
      return {
        kind: 'submitted',
        message: `Answers recorded for ${result.value.response.week.label}.`,
      };
    }

    const failure = result.failure;
    if (failure.kind === 'http' && failure.status === 409) {
      return { kind: 'duplicate' };
    }
    if (failure.kind === 'http' && failure.status === 400) {
      return {
        kind: 'invalid',
        message:
          failure.message.length > 0 ? failure.message : FALLBACK_MESSAGE,
      };
    }
    return {
      kind: 'error',
      message: failure.message.length > 0 ? failure.message : FALLBACK_MESSAGE,
    };
  }

  const [outcome, submitAction] = useActionState<SubmitOutcome, FormData>(
    submit,
    { kind: 'idle' },
  );

  if (load.status === 'loading' || load.status === 'idle') {
    return (
      <section className="card page-narrow">
        <h1>This week&apos;s pulse</h1>
        <p className="muted">Loading the active survey</p>
      </section>
    );
  }

  if (load.status === 'failed') {
    return (
      <section className="card page-narrow stack">
        <h1>This week&apos;s pulse</h1>
        <p className="error" role="alert">
          {load.failure.message}
        </p>
      </section>
    );
  }

  const payload = load.value;

  if (payload.survey === null) {
    return (
      <section className="card page-narrow">
        <header className="card-header">
          <h1>This week&apos;s pulse</h1>
          <p className="week">{payload.week.label}</p>
        </header>
        <p className="muted">No survey is active this week.</p>
      </section>
    );
  }

  const survey = payload.survey;
  const answered = outcome.kind === 'submitted' || outcome.kind === 'duplicate';

  return (
    <section className="card page-narrow">
      <header className="card-header">
        <p className="eyebrow">This week&apos;s pulse</p>
        <h1>{survey.title}</h1>
        <p className="week">{payload.week.label}</p>
      </header>

      {payload.hasRespondedThisWeek && (
        <p className="notice">You have already answered this week.</p>
      )}

      <form className="stack" action={submitAction}>
        {survey.questions.map((question, index) => (
          <QuestionField
            key={question.id}
            question={question}
            number={index + 1}
            disabled={answered}
          />
        ))}
        <div className="form-footer">
          <SubmitButton disabled={answered} />
        </div>
      </form>

      <div className="messages" aria-live="polite">
        {outcome.kind === 'submitted' && (
          <p className="success">{outcome.message}</p>
        )}
        {outcome.kind === 'duplicate' && (
          <p className="notice">You have already answered this week.</p>
        )}
        {outcome.kind === 'invalid' && (
          <p className="error" role="alert">
            {outcome.message}
          </p>
        )}
        {outcome.kind === 'error' && (
          <p className="error" role="alert">
            {outcome.message}
          </p>
        )}
      </div>
    </section>
  );
}
