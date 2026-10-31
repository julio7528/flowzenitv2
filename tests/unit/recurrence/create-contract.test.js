import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateRoutineSeriesInputSchema,
  validateCreateRoutineSeriesInput,
} from '../../../server/domain/recurrence/contracts.js';

const valid = Object.freeze({
  name: '  Study planning  ',
  weekdaysISO: [5, 1],
  startDate: '2026-10-30',
  endDate: '2026-11-06',
  startTime: '09:00',
});

test('routine creation requires clear values and normalizes only name, weekday order, and absent end time', () => {
  assert.deepEqual(validateCreateRoutineSeriesInput(valid), {
    name: 'Study planning',
    weekdaysISO: [1, 5],
    startDate: '2026-10-30',
    endDate: '2026-11-06',
    startTime: '09:00',
    endTime: null,
  });
  assert.deepEqual(validateCreateRoutineSeriesInput({ ...valid, endTime: null }).endTime, null);
  assert.deepEqual(validateCreateRoutineSeriesInput({ ...valid, endTime: '10:30' }).endTime, '10:30');
});

test('routine creation rejects missing name, weekdays, explicit date range, or start time', () => {
  const incomplete = [
    { ...valid, name: '   ' },
    { ...valid, weekdaysISO: [] },
    { ...valid, weekdaysISO: undefined },
    { ...valid, startDate: undefined },
    { ...valid, endDate: undefined },
    { ...valid, startTime: undefined },
  ];
  for (const value of incomplete) assert.equal(CreateRoutineSeriesInputSchema.safeParse(value).success, false);
});

test('routine creation rejects duplicate or out-of-range ISO weekdays and unsupported fields', () => {
  const invalid = [
    { ...valid, weekdaysISO: [1, 1] },
    { ...valid, weekdaysISO: [0] },
    { ...valid, weekdaysISO: [8] },
    { ...valid, weekdaysISO: [1.5] },
    { ...valid, weekdaysISO: [1, 2, 3, 4, 5, 6, 7, 1] },
    { ...valid, table: 'demandas' },
    { ...valid, sql: 'insert into demandas' },
  ];
  for (const value of invalid) assert.equal(CreateRoutineSeriesInputSchema.safeParse(value).success, false);
});

test('routine creation rejects invalid or reversed civil dates', () => {
  assert.equal(CreateRoutineSeriesInputSchema.safeParse({ ...valid, startDate: '2026-02-30' }).success, false);
  assert.equal(CreateRoutineSeriesInputSchema.safeParse({ ...valid, startDate: '2026-11-07' }).success, false);
});

test('routine creation rejects invalid start time and an end time that is not later', () => {
  const invalid = [
    { ...valid, startTime: '24:00' },
    { ...valid, startTime: '9:00' },
    { ...valid, endTime: '08:59' },
    { ...valid, endTime: '09:00' },
    { ...valid, endTime: '25:00' },
  ];
  for (const value of invalid) assert.equal(CreateRoutineSeriesInputSchema.safeParse(value).success, false);
});
