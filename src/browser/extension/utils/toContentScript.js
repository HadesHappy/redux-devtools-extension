import { stringify } from 'jsan';

/*
function stringify(obj) {
   return jsan.stringify(obj, function(key, value) {
   if (value && value.toJS) { return value.toJS(); }
   return value;
   }, null, true);
}
*/

export function toContentScript(message, shouldStringify) {
  if (shouldStringify) {
    if (message.payload) message.payload = stringify(message.payload);
    if (message.action) message.action = stringify(message.action);
  }
  window.postMessage(message, '*');
}

export function sendMessage(action, state, shouldStringify) {
  toContentScript({
    type: 'ACTION',
    action: typeof action === 'object' ? action : { type: action },
    payload: state,
    source: '@devtools-page',
    name: document.title
  }, shouldStringify);
}
