// Keyboard + mouse input: a pressed-key set plus edge-triggered "just pressed" keys.
export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  const mouse = { x: 0, y: 0, clicked: false };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyE: 'enter', Space: 'brake', KeyF: 'punch',
    KeyT: 'taxi', KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute', Enter: 'confirm',
  };

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!keys.has(action)) justPressed.add(action);
    keys.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) keys.delete(action);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.clicked = true;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    keys, mouse,
    down(action) { return keys.has(action); },
    pressed(action) { return justPressed.has(action); },
    // Call once per frame, after the game has read the input.
    endFrame() { justPressed.clear(); mouse.clicked = false; },
  };
}
