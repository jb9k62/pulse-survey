/**
 * Week bounder: scrub an instant and see which UTC week the server files it under. The label
 * is the API's own `weekOf`; the week start is the model in models/week.ts, because the real
 * one is SQL (`date_trunc('week', now() at time zone 'utc')`).
 */

import { useState } from 'react';
import { weekOf } from '@api/surveys/week.ts';
import {
  addDays,
  DAY_MS,
  localDate,
  localMidnight,
  utcMidnight,
  weekStartUtc,
} from '../models/week.ts';

const ZONES = [
  { id: 'UTC', label: 'UTC' },
  { id: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'Pacific/Auckland', label: 'Auckland' },
] as const;

type ZoneId = (typeof ZONES)[number]['id'];

interface Preset {
  id: string;
  label: string;
  instant: string;
  zone: ZoneId;
  note: string;
}

const PRESETS: readonly Preset[] = [
  {
    id: 'sast-monday',
    label: 'Monday 00:30 in Johannesburg',
    instant: '2026-09-20T22:30:00.000Z',
    zone: 'Africa/Johannesburg',
    note: 'Monday on the office clock, but still Sunday 22:30 in UTC, so the answer lands in the previous week. The same case is a test in apps/api/test/week.spec.ts.',
  },
  {
    id: 'last-ms',
    label: 'Sunday 23:59:59.999 UTC',
    instant: '2026-09-27T23:59:59.999Z',
    zone: 'UTC',
    note: 'The last millisecond of the week. One millisecond later is a new week and a new chance to answer.',
  },
  {
    id: 'ny-sunday',
    label: 'Sunday evening in New York',
    instant: '2026-09-28T01:30:00.000Z',
    zone: 'America/New_York',
    note: 'Sunday 21:30 locally is already Monday 01:30 in UTC, so a New York Member answering on Sunday evening is answering next week.',
  },
  {
    id: 'akl-new-year',
    label: 'New Year in Auckland',
    instant: '2026-12-31T11:00:00.000Z',
    zone: 'Pacific/Auckland',
    note: 'Midnight on 1 January in Auckland. The week started on Monday 28 December and runs across the year boundary; nothing resets at the new year.',
  },
];

const clockFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  });

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A ruler cell: the weekday letter over the day of the month, for a UTC midnight. */
function DayCell({ midnight }: { midnight: number }) {
  const date = new Date(midnight);
  return (
    <>
      <span>{date.getUTCDay() === 1 ? 'Mon' : LETTERS[date.getUTCDay()]}</span>
      <span>{date.getUTCDate()}</span>
    </>
  );
}

const STEP_MS = 30 * 60 * 1000;

export default function WeekBounds() {
  const first = PRESETS[0]!;
  const [instant, setInstant] = useState(Date.parse(first.instant));
  const [zone, setZone] = useState<ZoneId>(first.zone);
  const [presetId, setPresetId] = useState<string | null>(first.id);
  // The slider covers three weeks around the week of the last preset, so it stays steady
  // while the reader drags.
  const [anchorWeek, setAnchorWeek] = useState(weekStartUtc(instant));

  const rangeStart = utcMidnight(addDays(anchorWeek, -7));
  const rangeEnd = utcMidnight(addDays(anchorWeek, 14));
  const span = rangeEnd - rangeStart;
  const at = (ms: number) => `${((ms - rangeStart) / span) * 100}%`;

  const weekStart = weekStartUtc(instant);
  const week = weekOf(weekStart);
  const weekFrom = utcMidnight(weekStart);
  const weekTo = weekFrom + 7 * DAY_MS;
  const preset = PRESETS.find((candidate) => candidate.id === presetId) ?? null;

  const utcDays = Array.from({ length: 21 }, (_, index) => {
    const start = rangeStart + index * DAY_MS;
    return { start, end: start + DAY_MS };
  });

  // Local days that overlap the range, drawn on the same time axis as the UTC days.
  const firstLocal = localDate(rangeStart, zone);
  const localDays = Array.from({ length: 23 }, (_, index) => {
    const date = addDays(firstLocal, index - 1);
    const start = localMidnight(date, zone);
    const end = localMidnight(addDays(date, 1), zone);
    return { date, start, end };
  }).filter((day) => day.end > rangeStart && day.start < rangeEnd);

  function choosePreset(next: Preset) {
    const ms = Date.parse(next.instant);
    setInstant(ms);
    setZone(next.zone);
    setPresetId(next.id);
    setAnchorWeek(weekStartUtc(ms));
  }

  const clip = (ms: number) => Math.min(Math.max(ms, rangeStart), rangeEnd);

  return (
    <div className="okfw-week">
      <div className="okfw-presets" role="group" aria-label="Presets">
        {PRESETS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === presetId}
            // The viewer's render gate clicks this control and expects the widget to change.
            data-probe={candidate.id === 'last-ms' || undefined}
            onClick={() => choosePreset(candidate)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="okfw-row">
        <label>
          Clock on the wall{' '}
          <select
            value={zone}
            onChange={(event) => {
              setZone(event.target.value as ZoneId);
              setPresetId(null);
            }}
          >
            {ZONES.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="okfw-ruler" aria-hidden="true">
        <div className="okfw-ruler-label">UTC</div>
        <div className="okfw-track">
          <div
            className="okfw-week-band"
            style={{
              left: at(clip(weekFrom)),
              width: `${((clip(weekTo) - clip(weekFrom)) / span) * 100}%`,
            }}
          />
          {utcDays.map((day) => (
            <div
              key={day.start}
              className="okfw-day"
              data-monday={new Date(day.start).getUTCDay() === 1}
              style={{ left: at(day.start), width: at(rangeStart + DAY_MS) }}
            >
              <DayCell midnight={day.start} />
            </div>
          ))}
          <div className="okfw-marker" style={{ left: at(instant) }} />
        </div>
        {zone !== 'UTC' && (
          <>
            <div className="okfw-ruler-label">Local</div>
            <div className="okfw-track">
              {localDays.map((day) => (
                <div
                  key={day.date}
                  className="okfw-day okfw-local"
                  data-monday={
                    new Date(utcMidnight(day.date)).getUTCDay() === 1
                  }
                  style={{
                    left: at(clip(day.start)),
                    width: `${((clip(day.end) - clip(day.start)) / span) * 100}%`,
                  }}
                >
                  <DayCell midnight={utcMidnight(day.date)} />
                </div>
              ))}
              <div className="okfw-marker" style={{ left: at(instant) }} />
            </div>
          </>
        )}
      </div>

      <input
        className="okfw-slider"
        type="range"
        aria-label="Instant"
        min={rangeStart}
        max={rangeEnd - 1}
        step={STEP_MS}
        value={instant}
        onChange={(event) => {
          setInstant(Number(event.target.value));
          setPresetId(null);
        }}
      />

      <dl className="okfw-facts">
        <dt>On the wall clock</dt>
        <dd>{clockFormat(zone).format(instant)}</dd>
        <dt>In UTC</dt>
        <dd>{clockFormat('UTC').format(instant)}</dd>
        <dt>Filed under week</dt>
        <dd>
          <strong data-testid="week-label">{week.label}</strong>{' '}
          <code>week_start = {week.start}</code>
        </dd>
      </dl>
      {preset && <p className="okfw-note">{preset.note}</p>}
      <p className="okfw-model">
        The label is the API&apos;s own <code>weekOf</code>. The week start is a
        TypeScript model of the SQL fragment, tested against the same cases as
        the real one.
      </p>
    </div>
  );
}
