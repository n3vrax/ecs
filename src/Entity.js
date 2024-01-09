import { resizeComponents } from './Component.js';
import { $notQueries, $queries, queryAddEntity, queryCheckEntity, queryRemoveEntity } from './Query.js';
import {
  $localEntities,
  $localEntityLookup,
  $manualEntityRecycling,
  $size,
  $entityCursor,
  $recycledEntities,
  $removedEntities,
  resizeWorlds,
} from './World.js';
import { setSerializationResized } from './Serialize.js';

export const $entityMasks = Symbol('entityMasks');
export const $entityComponents = Symbol('entityComponents');
export const $entitySparseSet = Symbol('entitySparseSet');
export const $entityArray = Symbol('entityArray');
export const $entityIndices = Symbol('entityIndices');

let defaultSize = 100000;

// need a global EID cursor which all worlds and all components know about
// so that world entities can posess entire rows spanning all component tables
let globalSize = defaultSize;
let resizeThreshold = () => globalSize - globalSize / 5;

export const getGlobalSize = () => globalSize;

const defaultRemovedReuseThreshold = 0.01;
let removedReuseThreshold = defaultRemovedReuseThreshold;

export const resetGlobals = () => {
  globalSize = defaultSize;
  removedReuseThreshold = defaultRemovedReuseThreshold;
};

export const getDefaultSize = () => defaultSize;

/**
 * Sets the default maximum number of entities for worlds and component stores.
 *
 * @param {number} newSize
 */
export const setDefaultSize = (newSize) => {
  const oldSize = globalSize;

  defaultSize = newSize;
  resetGlobals();

  globalSize = newSize;
  resizeWorlds(newSize);
  setSerializationResized(true);
};

/**
 * Sets the number of entities that must be removed before removed entity ids begin to be recycled.
 * This should be set to as a % (0-1) of `defaultSize` that you would never likely remove/add on a single frame.
 *
 * @param {number} newThreshold
 */
export const setRemovedRecycleThreshold = (newThreshold) => {
  removedReuseThreshold = newThreshold;
};

export const getEntityCursor = (world) => world[$entityCursor];
export const getRemovedEntities = (world) => [...world[$recycledEntities], ...world[$removedEntities]];

export const eidToWorld = new Map();

export const flushRemovedEntities = (world) => {
  if (!world[$manualEntityRecycling]) {
    throw new Error(
      'bitECS - cannot flush removed entities, enable feature with the enableManualEntityRecycling function',
    );
  }

  world[$removedEntities].push(...world[$recycledEntities]);
  world[$recycledEntities].length = 0;
};

/**
 * Adds a new entity to the specified world.
 *
 * @param {World} world
 * @returns {number} eid
 */
export const addEntity = (world) => {
  const eid = world[$manualEntityRecycling]
    ? world[$removedEntities].length
      ? world[$removedEntities].shift()
      : world[$entityCursor]++
    : world[$removedEntities].length > Math.round(world[$size] * removedReuseThreshold)
      ? world[$removedEntities].shift()
      : world[$entityCursor]++;

  if (eid > world[$size]) throw new Error('bitECS - max entities reached');

  world[$entitySparseSet].add(eid);
  eidToWorld.set(eid, world);

  world[$notQueries].forEach((q) => {
    const match = queryCheckEntity(world, q, eid);
    if (match) queryAddEntity(q, eid);
  });

  world[$entityComponents].set(eid, new Set());

  return eid;
};

/**
 * Removes an existing entity from the specified world.
 *
 * @param {World} world
 * @param {number} eid
 */
export const removeEntity = (world, eid) => {
  // Check if entity is already removed
  if (!world[$entitySparseSet].has(eid)) return;

  // Remove entity from all queries
  // TODO: archetype graph
  world[$queries].forEach((q) => {
    queryRemoveEntity(world, q, eid);
  });

  // Free the entity
  if (world[$manualEntityRecycling]) world[$recycledEntities].push(eid);
  else world[$removedEntities].push(eid);

  // remove all eid state from world
  world[$entitySparseSet].remove(eid);
  world[$entityComponents].delete(eid);

  // remove from deserializer mapping
  world[$localEntities].delete(world[$localEntityLookup].get(eid));
  world[$localEntityLookup].delete(eid);

  // Clear entity bitmasks
  for (let i = 0; i < world[$entityMasks].length; i++) world[$entityMasks][i][eid] = 0;
};

/**
 *  Returns an array of components that an entity possesses.
 *
 * @param {*} world
 * @param {*} eid
 */
export const getEntityComponents = (world, eid) => {
  if (eid === undefined) throw new Error('bitECS - entity is undefined.');
  if (!world[$entitySparseSet].has(eid)) throw new Error('bitECS - entity does not exist in the world.');
  return Array.from(world[$entityComponents].get(eid));
};

/**
 * Checks the existence of an entity in a world
 *
 * @param {World} world
 * @param {number} eid
 */
export const entityExists = (world, eid) => world[$entitySparseSet].has(eid);
