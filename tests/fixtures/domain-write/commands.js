export const SYNTHETIC_WRITE_IDS = Object.freeze({
  demand: '900000000000000001',
  task: '900000000000000002',
  subtask: '900000000000000003',
});

export const SYNTHETIC_WRITE_COMMANDS = Object.freeze({
  createDemand: Object.freeze({
    operation: 'create_demand',
    version: 1,
    parentId: null,
    payload: Object.freeze({ name: 'Synthetic demand' }),
  }),
  createTask: Object.freeze({
    operation: 'create_task',
    version: 1,
    parentId: SYNTHETIC_WRITE_IDS.demand,
    payload: Object.freeze({ name: 'Synthetic task' }),
  }),
  createSubtask: Object.freeze({
    operation: 'create_subtask',
    version: 1,
    parentId: SYNTHETIC_WRITE_IDS.task,
    payload: Object.freeze({ name: 'Synthetic subtask' }),
  }),
  setSubtaskStatus: Object.freeze({
    operation: 'set_subtask_status',
    version: 1,
    targetId: SYNTHETIC_WRITE_IDS.subtask,
    payload: Object.freeze({ status: 'Executando' }),
  }),
});
