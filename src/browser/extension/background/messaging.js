import { MENU_DEVTOOLS } from '../../../app/constants/ContextMenus.js';
let connections = {};

function sendNAMessage(port) {
  port.postMessage({
    na: true,
    source: 'redux-page'
  });
}

// Listen to messages sent from the DevTools page
chrome.runtime.onConnect.addListener(function(port) {

  function extensionListener(message) {
    if (message.name === 'init') {
      if (message.tabId !== store.tabId) {
        sendNAMessage(port);
        return;
      }
      connections[message.tabId] = port;
      connections[message.tabId].postMessage({
        payload: store.liftedStore.getState(),
        source: 'redux-page'
      });
    }
  }

  port.onMessage.addListener(extensionListener);

  port.onDisconnect.addListener(function(portDiscon) {
    portDiscon.onMessage.removeListener(extensionListener);

    Object.keys(connections).forEach(function(id) {
      if (connections[id] === portDiscon) {
        delete connections[id];
      }
    });
  });
});

// Receive message from content script and relay to the devTools page
chrome.runtime.onMessage.addListener(function(request, sender) {
  if (sender.tab) {
    const tabId = sender.tab.id;
    if (request.type === 'PAGE_UNLOADED') {
      if (connections[ tabId ]) sendNAMessage(connections[ tabId ]);
      return true;
    }
    if (request.payload) store.liftedStore.setState(request.payload);
    if (request.init) {
      store.tabId = tabId;
      chrome.contextMenus.update(MENU_DEVTOOLS, {documentUrlPatterns: [sender.url], enabled: true});
      chrome.pageAction.show(tabId);
    }
    if (tabId in connections) {
      connections[ tabId ].postMessage(request);
    }
  }
  return true;
});

export function toContentScript(action) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(store.tabId, {action: action}, function(response) {});
  });
}
