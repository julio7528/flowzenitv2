/**
 * Deterministic, in-memory records for SPEC-004 domain-read tests.
 *
 * These are synthetic table-shaped values only. They never connect to Supabase
 * or represent product rows. Persistent bigint IDs stay decimal strings so a
 * consumer cannot accidentally round them through JavaScript Number.
 */

export const DOMAIN_READ_FIXTURE_IDS = Object.freeze({
  demandWithHierarchy: '9007199254741001',
  taskWithSchedule: '9007199254741002',
  overlappingSubtaskA: '9007199254741003',
  overlappingSubtaskB: '9007199254741004',
  completedTask: '9007199254741005',
  completedSubtask: '9007199254741006',
  scheduledDemandWithoutTasks: '9007199254741007',
  backlogDemand: '9007199254741008',
  backlogTask: '9007199254741009',
  routineWeekdays: '9007199254742011',
  routineOptionalEnd: '9007199254742012',
});

export const DOMAIN_READ_FIXTURE_DATES = Object.freeze({
  day: '2026-10-30',
  weekStart: '2026-10-26',
  nextWeekStart: '2026-11-02',
});

/**
 * Build fresh synthetic PostgreSQL-shaped rows for tests.
 *
 * @param {{ marker?: string }} options A test-only prefix for searchable names.
 * @returns {{ marker: string, ids: typeof DOMAIN_READ_FIXTURE_IDS, dates: typeof DOMAIN_READ_FIXTURE_DATES, demandas: object[], recorrente: object[], hierarchy: object, schedule: object, weekly: object }}
 */
export function createDomainReadFixtures({ marker = 'spec004-synthetic' } = {}) {
  if (typeof marker !== 'string' || marker.trim().length === 0) {
    throw new TypeError('Fixture marker must be a non-empty string.');
  }

  const names = {
    demand: `${marker}-demand-root`,
    scheduledTask: `${marker}-scheduled-task`,
    ambiguousSubtask: `${marker}-ambiguous-subtask`,
    completedTask: `${marker}-completed-task`,
    completedSubtask: `${marker}-completed-subtask`,
    scheduledDemand: `${marker}-scheduled-demand-without-tasks`,
    backlogDemand: `${marker}-backlog-demand`,
    backlogTask: `${marker}-backlog-task`,
  };

  const demandas = [
    {
      id: DOMAIN_READ_FIXTURE_IDS.demandWithHierarchy,
      demanda: names.demand,
      tipo: 1,
      raizid: null,
      status: 'Em andamento',
      data_exec: null,
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.taskWithSchedule,
      demanda: names.scheduledTask,
      tipo: 2,
      raizid: DOMAIN_READ_FIXTURE_IDS.demandWithHierarchy,
      status: 'Em andamento',
      data_exec: DOMAIN_READ_FIXTURE_DATES.day,
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskA,
      demanda: names.ambiguousSubtask,
      tipo: 3,
      raizid: DOMAIN_READ_FIXTURE_IDS.taskWithSchedule,
      status: 'Executando',
      data_exec: DOMAIN_READ_FIXTURE_DATES.day,
      hora_inicio: '09:00:00',
      hora_fim: '10:00:00',
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskB,
      demanda: names.ambiguousSubtask,
      tipo: 3,
      raizid: DOMAIN_READ_FIXTURE_IDS.taskWithSchedule,
      status: 'Aguardando',
      data_exec: DOMAIN_READ_FIXTURE_DATES.day,
      hora_inicio: '09:30:00',
      hora_fim: '10:30:00',
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.completedTask,
      demanda: names.completedTask,
      tipo: 2,
      raizid: DOMAIN_READ_FIXTURE_IDS.demandWithHierarchy,
      status: 'Done',
      data_exec: DOMAIN_READ_FIXTURE_DATES.nextWeekStart,
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.completedSubtask,
      demanda: names.completedSubtask,
      tipo: 3,
      raizid: DOMAIN_READ_FIXTURE_IDS.completedTask,
      status: 'Done',
      data_exec: null,
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.scheduledDemandWithoutTasks,
      demanda: names.scheduledDemand,
      tipo: 1,
      raizid: null,
      status: 'Backlog',
      data_exec: '2026-10-31',
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.backlogDemand,
      demanda: names.backlogDemand,
      tipo: 1,
      raizid: null,
      status: 'Backlog',
      data_exec: null,
      hora_inicio: null,
      hora_fim: null,
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.backlogTask,
      demanda: names.backlogTask,
      tipo: 2,
      raizid: DOMAIN_READ_FIXTURE_IDS.backlogDemand,
      status: 'Backlog',
      data_exec: null,
      hora_inicio: null,
      hora_fim: null,
    },
  ];

  const recorrente = [
    {
      id: DOMAIN_READ_FIXTURE_IDS.routineWeekdays,
      demanda: `${marker}-routine-weekdays`,
      hora: '08:00:00',
      hora_fim: '08:30:00',
      dias_semana: [1, 3, 5],
      data_inicial: '2026-10-01',
      data_final: '2026-12-31',
    },
    {
      id: DOMAIN_READ_FIXTURE_IDS.routineOptionalEnd,
      demanda: `${marker}-routine-without-end-time`,
      hora: '07:00:00',
      hora_fim: null,
      dias_semana: [5, 6],
      data_inicial: '2026-10-30',
      data_final: '2026-11-06',
    },
  ];

  const byId = Object.fromEntries(demandas.map((row) => [row.id, row]));

  return {
    marker,
    ids: { ...DOMAIN_READ_FIXTURE_IDS },
    dates: { ...DOMAIN_READ_FIXTURE_DATES },
    demandas,
    recorrente,
    hierarchy: {
      demand: byId[DOMAIN_READ_FIXTURE_IDS.demandWithHierarchy],
      task: byId[DOMAIN_READ_FIXTURE_IDS.taskWithSchedule],
      subtasks: [
        byId[DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskA],
        byId[DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskB],
      ],
    },
    schedule: {
      date: DOMAIN_READ_FIXTURE_DATES.day,
      overlappingSubtaskIds: [
        DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskA,
        DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskB,
      ],
    },
    weekly: {
      weekStart: DOMAIN_READ_FIXTURE_DATES.weekStart,
      nextWeekStart: DOMAIN_READ_FIXTURE_DATES.nextWeekStart,
      scheduledDemandId: DOMAIN_READ_FIXTURE_IDS.scheduledDemandWithoutTasks,
      scheduledTaskId: DOMAIN_READ_FIXTURE_IDS.taskWithSchedule,
      backlogTaskId: DOMAIN_READ_FIXTURE_IDS.backlogTask,
      excludedSubtaskIds: [
        DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskA,
        DOMAIN_READ_FIXTURE_IDS.overlappingSubtaskB,
        DOMAIN_READ_FIXTURE_IDS.completedSubtask,
      ],
    },
  };
}
