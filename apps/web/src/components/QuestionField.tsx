/**
 * One question of the Member form: a labelled `fieldset` with a `legend` and
 * one radio per choice. The input `name` is the question id, because the
 * action reads the answers straight out of `FormData`.
 *
 * Each radio is drawn as a key (see `.choice` in app.css). The real input
 * stays in the label, so the radio keeps its role, name and keyboard use.
 */

import type { SurveyQuestion } from '@pulse/contracts';

const RATING_VALUES = [1, 2, 3, 4, 5];

// Without this a Member cannot tell which end of the scale is good.
const RATING_HINT = '1 is the lowest, 5 is the highest';

function Choice({
  name,
  value,
  label,
  required,
}: {
  name: string;
  value: string;
  label: string;
  required: boolean;
}) {
  return (
    <label className="choice">
      <input type="radio" name={name} value={value} required={required} />
      <span>{label}</span>
    </label>
  );
}

export default function QuestionField({
  question,
  number,
  disabled = false,
}: {
  question: SurveyQuestion;
  number: number;
  disabled?: boolean;
}) {
  const isRating = question.type === 'rating';
  const hintId = `${question.id}-hint`;
  return (
    <fieldset
      className="question"
      disabled={disabled}
      aria-describedby={isRating ? hintId : undefined}
    >
      <legend>
        <span className="question-number" aria-hidden="true">
          {`Q${number}`}
        </span>
        {question.prompt}
      </legend>
      <div className="choices">
        {isRating ? (
          RATING_VALUES.map((value) => (
            <Choice
              key={value}
              name={question.id}
              value={String(value)}
              label={String(value)}
              // One `required` radio makes the whole same-name group required
              // (HTML radio button group rules), so the first carries it.
              required={value === 1}
            />
          ))
        ) : (
          <>
            <Choice name={question.id} value="yes" label="Yes" required />
            <Choice name={question.id} value="no" label="No" required={false} />
          </>
        )}
      </div>
      {isRating && (
        <p className="muted scale-hint" id={hintId}>
          {RATING_HINT}
        </p>
      )}
    </fieldset>
  );
}
