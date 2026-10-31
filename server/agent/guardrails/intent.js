export const POC_CREATE_OPERATION_NAMES = Object.freeze([
  'create_task',
  'create_subtask',
  'create_routine_series',
]);

const CREATE_VERB = /\b(?:crie|criar|cria|cadastre|cadastrar|registre|registrar|adicione|adicionar|inclua|incluir|insira|inserir|create|add|register)\b/iu;
const TASK_KIND = /\b(?:tarefas?|tasks?)\b/iu;
const SUBTASK_KIND = /\b(?:subtarefas?|subtasks?)\b/iu;
const ROUTINE_KIND = /\b(?:rotinas?|recorr[eê]ncias?|demandas?\s+recorrentes?)\b/iu;
const NEXT_WEEK = /\b(?:semana\s+que\s+vem|pr[oó]xima\s+semana|semana\s+seguinte|next\s+week)\b/iu;
const EXPLICIT_DATE = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})\b/g;
const EXPLICIT_TIME = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)\b/iu;
const EXPLICIT_WEEKDAY = /\b(?:segundas?(?:-feiras?)?|ter[cç]as?(?:-feiras?)?|quartas?(?:-feiras?)?|quintas?(?:-feiras?)?|sextas?(?:-feiras?)?|s[aá]bados?|domingos?|todos?\s+os\s+dias|diariamente|fim\s+de\s+semana)\b/iu;

function hasExplicitRoutineDetails(message) {
  const dateTokens = message.match(EXPLICIT_DATE) ?? [];
  return dateTokens.length >= 2
    && EXPLICIT_TIME.test(message)
    && EXPLICIT_WEEKDAY.test(message)
    && !NEXT_WEEK.test(message);
}

/** Classify only the latest user sentence; model or retrieved text never calls this for authority. */
export function classifyPocCreateIntent(message) {
  if (typeof message !== 'string' || !CREATE_VERB.test(message)) {
    return Object.freeze({
      directUserIntent: false,
      directCreateOperations: Object.freeze([]),
      routineClarificationRequired: false,
    });
  }

  const operations = [];
  if (TASK_KIND.test(message)) operations.push('create_task');
  if (SUBTASK_KIND.test(message)) operations.push('create_subtask');
  const routineIntent = ROUTINE_KIND.test(message);
  if (routineIntent) operations.push('create_routine_series');

  return Object.freeze({
    directUserIntent: operations.length > 0,
    directCreateOperations: Object.freeze(operations),
    routineClarificationRequired: routineIntent && !hasExplicitRoutineDetails(message),
  });
}
