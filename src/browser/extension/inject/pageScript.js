import { getActionsArray, evalAction } from 'remotedev-utils';
import createStore from '../../../app/stores/createStore';
import configureStore, { getUrlParam } from '../../../app/stores/enhancerStore';
import { isAllowed } from '../options/syncOptions';
import Monitor from '../../../app/service/Monitor';
import { getLocalFilter, isFiltered, filterState } from '../../../app/api/filters';
import notifyErrors from '../../../app/api/notifyErrors';
import importState from '../../../app/api/importState';
import openWindow from '../../../app/api/openWindow';
import {
  updateStore, toContentScript, sendMessage, setListener, connect, disconnect, generateId
} from '../../../app/api';

let stores = {};
let isLocked = false;
let reportId;

const devToolsExtension = function(reducer, preloadedState, config) {
  /* eslint-disable no-param-reassign */
  if (typeof reducer === 'object') {
    config = reducer; reducer = undefined;
  } else if (typeof config !== 'object') config = {};
  /* eslint-enable no-param-reassign */
  if (!window.devToolsOptions) window.devToolsOptions = {};

  let store;
  let shouldSerialize = config.serializeState || config.serializeAction;
  let errorOccurred = false;
  let isExcess;
  let actionCreators;
  const instanceId = generateId(config.instanceId);
  const localFilter = getLocalFilter(config);
  const { statesFilter, actionsFilter } = config;

  const monitor = new Monitor(relayState);
  if (config.getMonitor) config.getMonitor(monitor);

  function relay(type, state, action, nextActionId, shouldInit) {
    const message = {
      type,
      payload: filterState(state, type, localFilter, statesFilter, actionsFilter, nextActionId),
      source: '@devtools-page',
      instanceId
    };

    if (type === 'ACTION') {
      message.action = !actionsFilter ? action : actionsFilter(action.action, nextActionId - 1);
      message.isExcess = isExcess;
      message.nextActionId = nextActionId;
    } else if (shouldInit) {
      message.action = action;
      message.name = config.name || document.title;
    }

    if (shouldSerialize || window.devToolsOptions.serialize !== false) {
      toContentScript(message, true, config.serializeState, config.serializeAction);
    } else {
      toContentScript(message);
    }
  }

  function relayState(actions, shouldInit) {
    relay('STATE', store.liftedStore.getState(), actions, undefined, shouldInit);
  }

  function dispatchRemotely(action) {
    try {
      const result = evalAction(action, actionCreators);
      store.dispatch(result);
    } catch (e) {
      relay('ERROR', e.message);
    }
  }

  function onMessage(message) {
    switch (message.type) {
      case 'DISPATCH':
        store.liftedStore.dispatch(message.payload);
        return;
      case 'ACTION':
        dispatchRemotely(message.payload);
        return;
      case 'IMPORT':
        const nextLiftedState = importState(message.state, config);
        if (!nextLiftedState) return;
        store.liftedStore.dispatch({type: 'IMPORT_STATE', ...nextLiftedState});
        relayState();
        return;
      case 'UPDATE':
        relayState();
        return;
      case 'START':
        monitor.start(true);
        if (!actionCreators && config.actionCreators) {
          actionCreators = getActionsArray(config.actionCreators);
        }
        relayState(JSON.stringify(actionCreators), true);

        if (reportId) {
          relay('GET_REPORT', reportId);
          reportId = null;
        }
        return;
      case 'STOP':
        monitor.stop();
        relay('STOP');
    }
  }

  function init() {
    setListener(onMessage, instanceId);
    notifyErrors(() => {
      errorOccurred = true;
      const state = store.liftedStore.getState();
      if (state.computedStates[state.currentStateIndex].error) {
        relay('STATE', state);
      }
      return true;
    });

    relay('INIT_INSTANCE');

    if (typeof reportId === 'undefined') {
      reportId = getUrlParam('remotedev_report');
      if (reportId) openWindow();
    }
  }

  function handleChange(state, liftedState) {
    if (!monitor.active) return;
    const nextActionId = liftedState.nextActionId;
    const liftedAction = liftedState.actionsById[nextActionId - 1];
    const action = liftedAction.action;
    if (!errorOccurred && !monitor.isMonitorAction()) {
      if (isFiltered(action, localFilter)) return;
      const { maxAge } = window.devToolsOptions;
      relay('ACTION', state, liftedAction, nextActionId);
      if (!isExcess && maxAge) isExcess = liftedState.stagedActionIds.length >= maxAge;
    } else {
      if (monitor.isTimeTraveling()) return;
      if (errorOccurred && !liftedState.computedStates[liftedState.currentStateIndex].error) {
        errorOccurred = false;
      }
      relay('STATE', liftedState);
    }
  }

  const enhance = () => (next) => {
    return (reducer_, initialState_, enhancer_) => {
      if (!isAllowed(window.devToolsOptions)) return next(reducer_, initialState_, enhancer_);

      store = stores[instanceId] =
        configureStore(next, monitor.reducer, config)(reducer_, initialState_, enhancer_);

      init();
      store.subscribe(() => {
        handleChange(store.getState(), store.liftedStore.getState());
      });
      return store;
    };
  };

  if (!reducer) return enhance();
  return createStore(reducer, preloadedState, enhance);
};

// noinspection JSAnnotator
window.devToolsExtension = devToolsExtension;
window.devToolsExtension.open = openWindow;
window.devToolsExtension.updateStore = updateStore(stores);
window.devToolsExtension.notifyErrors = notifyErrors;
window.devToolsExtension.send = sendMessage;
window.devToolsExtension.listen = setListener;
window.devToolsExtension.connect = connect;
window.devToolsExtension.disconnect = disconnect;

window.__REDUX_DEVTOOLS_EXTENSION__ = window.devToolsExtension;

window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ = (...funcs) => {
  if (funcs.length === 0) {
    return devToolsExtension;
  }

  if (funcs.length === 1 && typeof funcs[0] === 'object') {
    return devToolsExtension(funcs[0]);
  }

  return (config) => {
    const instanceId = generateId(config.instanceId);

    const preEnhancer = (next) =>
      (reducer, preloadedState, enhancer) => {
        const store = next(reducer, preloadedState, enhancer);

        // Mutate the store in order to keep the reference
        stores[instanceId].dispatch = store.dispatch;
        stores[instanceId].liftedStore = store.liftedStore;
        stores[instanceId].getState = store.getState;

        return {
          ...store,
          dispatch: (action) => (
            isLocked ? action : store.dispatch(action)
          )
        };
      };

    return (...args) => [preEnhancer, ...funcs].reduceRight(
      (composed, f) => f(composed), devToolsExtension({ ...config, instanceId })(...args)
    );
  };
};
