'use strict';
/**
 * The event hook allows the developer to hook into any kind of webhook event.
 * Once a webhook event is received, verified and/or processed,
 * it will be routed to the registered hooks.
 * NOTE: the hooks will be called with (eventName, done),
 * so that they can be executed in a synchronous flow
 */

let hookerObj = null;

module.exports = function(thorin, opt) {
  if(hookerObj) return hookerObj;
  const logger = thorin.logger(opt.logger),
    async = thorin.util.async;
  const REGISTERED_HOOKS = {};  // {eventName: [array of fns]}
  const hooker = {};

  /*
   * Register a new hook
   * */
  hooker.addHook = function AddEventHook() {
    const events = Array.prototype.slice.call(arguments),
      fn = events.pop();
    for(let i=0; i < events.length; i++) {
      if(typeof events[i] !== 'string') continue;
      const eventName = events[i];
      if (typeof REGISTERED_HOOKS[eventName] === 'undefined') {
        REGISTERED_HOOKS[eventName] = [];
      }
      REGISTERED_HOOKS[eventName].push(fn);
    }
    return hooker;
  }

  /* Checks if there is a hook registered for the given event. */
  hooker.hasHook = function HasEventHook(eventName) {
    if(typeof REGISTERED_HOOKS[eventName] === 'undefined') return false;
    return true;
  }

  /*
   * Execute a hook.
   * */
  hooker.runHook = function RunEventHook(eventName, eventData, onDone) {
    if (typeof REGISTERED_HOOKS[eventName] === 'undefined') return onDone && onDone();
    const calls = [];
    REGISTERED_HOOKS[eventName].forEach((fn) => {
      calls.push((done) => {
        try {
          fn(eventData, done, eventName);
        } catch(e) {
          logger.warn(`Event hook for event ${eventName} threw an error.`);
          logger.debug(e);
          return onDone(e);
        }
      });
    });
    async.series(calls, onDone);
  };
  hookerObj = hooker;
  return hooker;
}
