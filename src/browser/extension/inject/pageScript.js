import stringify from 'json-stringify-safe';
import configureStore from '../../../app/store/configureStore';
import { ACTION, UPDATE } from '../../../app/constants/ActionTypes';

window.devToolsInit = function(store) {
  function onChange(init) {
    window.postMessage({
      payload: stringify(store.liftedStore.getState()),
      source: 'redux-page',
      init: init || false
    }, '*');
  }

  function onMessage(event) {
    if (!event || event.source !== window) {
      return;
    }

    const message = event.data;

    if (!message || message.source !== 'redux-cs') {
      return;
    }

    if (message.type === ACTION) {
      store.liftedStore.dispatch(message.payload);
    }

    if (message.type === UPDATE) {
      onChange();
    }
  }

  store.liftedStore.subscribe(onChange);
  window.addEventListener('message', onMessage, false);

  onChange(true);
};

window.devToolsExtension = function(next) {
  if (next) {
    console.warn('Please use \'window.devToolsExtension()\' instead of \'window.devToolsExtension\' as store enhancer. The latter will not be supported.');
    return (reducer, initialState) => {
      const store = configureStore(next)(reducer, initialState);
      devToolsInit(store);
      return store;
    };
  }
  return (next) => {
    return (reducer, initialState) => {
      const store = configureStore(next)(reducer, initialState);
      devToolsInit(store);
      return store;
    };
  };
};
