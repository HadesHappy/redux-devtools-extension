import React, { Component, PropTypes } from 'react';

class Counter extends Component {
  constructor() {
    super();
    this.state = { counter: 0 };
    
    this.increment = this.increment.bind(this);
    this.decrement = this.decrement.bind(this);
  }

  increment() {
    const state = { counter: this.state.counter + 1 };
    window.devToolsExtension && window.devToolsExtension.send('increment', state);
    this.setState(state);
  }

  decrement() {
    const state = { counter: this.state.counter - 1 };
    window.devToolsExtension && window.devToolsExtension.send('decrement', state);
    this.setState(state);
  }

  render() {
    const { counter } = this.state;
    return (
      <p>
        Clicked: {counter} times
        {' '}
        <button onClick={this.increment}>+</button>
        {' '}
        <button onClick={this.decrement}>-</button>
      </p>
    );
  }
}

export default Counter;
