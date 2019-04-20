import { component, html, render, useState, useEffect, withHooks, virtual } from '../web.js';
import { attach, cycle } from './helpers.js';

describe('virtual()', () => {
  it('Creates virtual components', async () => {
    let el = document.createElement('div');
    let set;

    const App = withHooks(() => {
      const [count, setCount] = useState(0);
      set = setCount;

      return html`<span>${count}</span>`
    });

    render(App(), el);

    await cycle();
    assert.equal(el.firstElementChild.textContent, '0');

    set(1);
    await cycle();
    assert.equal(el.firstElementChild.textContent, '1');
  });

  it('Rendering children doesn\'t rerender the parent', async () => {
    let el = document.createElement('div');
    let set;

    let childRenders = 0;
    const Child = withHooks(() => {
      childRenders++;
      const [count, setCount] = useState(0);
      set = setCount;
      return html`<span id="count">${count}</span>`;
    });

    let parentRenders = 0;
    const Parent = withHooks(() => {
      parentRenders++;

      return html`
        <section>${Child()}</section>
      `;
    });

    render(Parent(), el);

    await cycle();

    assert.equal(parentRenders, 1);
    assert.equal(childRenders, 1);

    set(1);
    await cycle();

    assert.equal(parentRenders, 1);
    assert.equal(childRenders, 2);

    let span = el.firstElementChild.firstElementChild;
    assert.equal(span.textContent, "1");
  });

  it('Parent can pass args to the child', async () => {
    let el = document.createElement('div');

    const Child = withHooks((foo, baz) => {
      return html`<span>${foo}-${baz}</span>`;
    });

    const Parent = withHooks(() => {
      return html`
        <section>${Child('bar', 'qux')}</section>
      `;
    });

    render(Parent(), el);

    await cycle();
    await cycle();
    let span = el.firstElementChild.firstElementChild;
    assert.equal(span.textContent, 'bar-qux');
  });

  it('Rerender parent doesn\'t create a new child', async () => {
    let el = document.createElement('div');
    let setParent, setChild;

    const Child = () => {
      const [count, setCount] = useState(0);
      setChild = setCount;

      return html`<span>${count}</span>`;
    };

    const Parent = withHooks(() => {
      const [, set] = useState('');
      setParent = set;
      return html`<div>${withHooks(Child)()}</div>`;
    });

    render(Parent(), el);

    await cycle();

    // Change the child's state.
    setChild(1);

    await cycle();
    setParent('foo');

    await cycle();
    await cycle();

    let span = el.firstElementChild.firstElementChild;
    assert.equal(span.textContent, '1');
  });

  it('Can use effects', async () => {
    let effect = false;
    const App = withHooks(() => {
      useEffect(() => {
        effect = true;
      });
    });

    let el = document.createElement('div');
    render(App(), el);

    await cycle();
    assert.equal(effect, true, 'Effect ran within the virtual component');
  });

  it('Teardown is invoked', async () => {
    const tag = 'app-with-virtual-teardown';
    let teardownCalled = 0;
    let set;

    const Counter = () => {
      useEffect(() => {
        console.log("connected component");
        return () => {
          console.log("disconnected component");
          teardownCalled++;
        };
      }, []);
      return html`<div>STUFF</div>`;
    };

    const Main = () => {
      const [show2, toggle2] = useState(true);
      set = toggle2;
      return html`
        Virtual:
        ${show2 ? virtual(Counter)() : undefined}
      `;
    };

    customElements.define(tag, component(Main));

    let teardown = attach(tag);
    await cycle();

    set(false);
    await cycle();
    teardown();

    assert.equal(teardownCalled, 1, 'Use effect teardown called');
  });

  it('Multiple virtual components will not affect each other', async () => {
    let el = document.createElement('div');

    let toggleCounter1;
    let toggleCounter2;
    const Main = () => {
      const [show, toggle] = useState(true);
      const [show2, toggle2] = useState(true);

      toggleCounter1 = toggle;
      toggleCounter2 = toggle2;

      return html`
        <button @click="${() => toggle(!show)}">${show ? "Hide" : "Show"}</button>
        ${show ? virtual(Counter1)() : undefined}

        <br /><br />

        <button @click="${() => toggle2(!show2)}">
          ${show2 ? "Hide" : "Show"}
        </button>
        ${show2 ? virtual(Counter2)() : undefined}
      `;
    };

    let set1;
    let values1 = [];
    const Counter1 = () => {
      useEffect(() => {
        console.log("connected component");
        return () => {
          console.log("disconnected component");
        };
      }, []);
      const [count, setCount] = useState(0);
      set1 = setCount;
      values1.push(count);

      return html`
        <button type="button" @click="${() => setCount(count + 1)}">
          Count: ${count}
        </button>
      `;
    };

    let set2;
    let values2 = [];
    const Counter2 = () => {
      useEffect(() => {
        console.log("connected component");
        return () => {
          console.log("disconnected component");
        };
      }, []);
      const [count, setCount] = useState(0);
      set2 = setCount;
      values2.push(count);

      return html`
        <button type="button" @click="${() => setCount(count + 1)}">
          Count: ${count}
        </button>
      `;
    };

    render(virtual(Main)(), el);

    await cycle();

    set1(1);
    set2(2);
    await cycle();

    toggleCounter1(false);
    await cycle();

    assert.equal(values1[0], 0, 'First component first state');
    assert.equal(values1[1], 1, 'First component second state');
    assert.equal(values2[0], 0, 'Second component first state');
    assert.equal(values2[1], 2, 'Second component second state');
    assert.equal(values1.length, 2, 'First component state only had 2 values');
    assert.equal(values2.length, 2, 'Second component state only had 2 values');
  });

  it('Teardown is invoked through indirection', async () => {
    const tag = 'app-with-virtual-teardown-indirection';
    let teardownCalled = 0;
    let set;

    const Counter = virtual(() => {
      useEffect(() => {
        console.log("connected component");
        return () => {
          console.log("disconnected component");
          teardownCalled++;
        };
      }, []);
      return html`<div>STUFF</div>`;
    });

    const Indirection = () => html`<div>${Counter()}</div>`;

    const Main = () => {
      const [show2, toggle2] = useState(true);
      set = toggle2;
      return html`
        Virtual:
        ${show2 ? Indirection() : undefined}
      `;
    };

    customElements.define(tag, component(Main));

    let teardown = attach(tag);
    await cycle();

    set(false);
    await cycle();
    teardown();

    assert.equal(teardownCalled, 1, 'Use effect teardown called');
  });

  it('Teardown is invoked without custom component', async () => {
    let el = document.createElement('div');
    let teardownCalled = 0;
    let set;

    const Counter = virtual(() => {
      useEffect(() => {
        console.log("connected component");
        return () => {
          console.log("disconnected component");
          teardownCalled++;
        };
      }, []);
      return html`<div>STUFF</div>`;
    });

    const Main = virtual(() => {
      const [show2, toggle2] = useState(true);
      set = toggle2;
      return html`
        Virtual:
        ${show2 ? Counter() : undefined}
      `;
    });

    render(Main(), el)
    await cycle();

    set(false);
    await cycle();

    assert.equal(teardownCalled, 1, 'Use effect teardown called');
  });
});
