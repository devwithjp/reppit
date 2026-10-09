#!/usr/bin/env -S node --experimental-websocket --no-warnings
// Minimal Chrome DevTools Protocol driver for the desk's own Chrome window.
// No dependencies. The window is launched by bip/chrome.sh with a control port on 127.0.0.1:9333.
//
//   node --experimental-websocket bip/xb.mjs <command> [args]
//
//   url                       current page URL
//   goto <url>                navigate and wait for the page to settle
//   shot <file.png>           screenshot of the visible page
//   text [maxChars]           visible text of the page
//   eval <js>                 evaluate an expression in the page, print the JSON result
//   click <css>               click the first element matching a CSS selector
//   type <css> <text>         focus an element and insert text as if typed, at human pace
//   upload <css> <file...>    put files into an <input type=file>
//   wait <css> [ms]           wait until an element exists (default 15000 ms)
//
// Typing uses real key events with randomised gaps, so X sees a person typing rather than
// text appearing all at once.

const PORT = process.env.XB_PORT || 9333;
const [, , cmd, ...args] = process.argv;

async function pageTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await res.json();
  const page = list.find((t) => t.type === "page" && !t.url.startsWith("devtools://"));
  if (!page) throw new Error("no page open in the desk Chrome. Run bip/chrome.sh");
  return page;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = () => reject(new Error("could not connect to Chrome on port " + PORT));
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const n = ++id;
            pending.set(n, { res, rej });
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
        on: (fn) => listeners.push(fn),
        close: () => ws.close(),
      });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);

async function evaluate(c, expression) {
  const r = await c.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

async function waitFor(c, css, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(c, `!!document.querySelector(${JSON.stringify(css)})`)) return true;
    await sleep(300);
  }
  throw new Error("timed out waiting for " + css);
}

async function main() {
  const page = await pageTarget();
  const c = await connect(page.webSocketDebuggerUrl);
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  try {
    switch (cmd) {
      case "url":
        console.log(await evaluate(c, "location.href"));
        break;
      case "goto": {
        await c.send("Page.navigate", { url: args[0] });
        await sleep(jitter(2500, 4000));
        console.log(await evaluate(c, "location.href"));
        break;
      }
      case "shot": {
        const { data } = await c.send("Page.captureScreenshot", { format: "png" });
        const fs = await import("node:fs");
        fs.writeFileSync(args[0], Buffer.from(data, "base64"));
        console.log("saved " + args[0]);
        break;
      }
      case "text": {
        const max = Number(args[0] || 4000);
        console.log((await evaluate(c, "document.body.innerText")).slice(0, max));
        break;
      }
      case "eval":
        console.log(JSON.stringify(await evaluate(c, args.join(" ")), null, 1));
        break;
      case "wait":
        await waitFor(c, args[0], Number(args[1] || 15000));
        console.log("found " + args[0]);
        break;
      case "click": {
        await waitFor(c, args[0]);
        const box = await evaluate(
          c,
          `(() => { const e = document.querySelector(${JSON.stringify(args[0])}); e.scrollIntoView({block:'center'});
             const r = e.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`
        );
        await sleep(jitter(250, 700));
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
          await c.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
          await sleep(jitter(40, 120));
        }
        console.log("clicked " + args[0]);
        break;
      }
      case "type": {
        const [css, ...rest] = args;
        const text = rest.join(" ");
        await waitFor(c, css);
        await evaluate(c, `document.querySelector(${JSON.stringify(css)}).focus()`);
        await sleep(jitter(300, 800));
        for (const ch of text) {
          if (ch === "\n") {
            await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
            await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
          } else {
            await c.send("Input.insertText", { text: ch });
          }
          // Mostly quick keystrokes, occasionally a longer pause, like someone thinking mid-sentence.
          await sleep(Math.random() < 0.04 ? jitter(400, 1200) : jitter(35, 140));
        }
        console.log(`typed ${text.length} characters`);
        break;
      }
      case "upload": {
        const [css, ...files] = args;
        await waitFor(c, css);
        const { root } = await c.send("DOM.getDocument", { depth: -1, pierce: true });
        const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: css });
        const path = await import("node:path");
        await c.send("DOM.setFileInputFiles", { nodeId, files: files.map((f) => path.resolve(f)) });
        await sleep(jitter(1500, 3000));
        console.log("attached " + files.join(", "));
        break;
      }
      default:
        console.log("commands: url, goto, shot, text, eval, click, type, upload, wait");
    }
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error("xb: " + e.message);
  process.exit(1);
});
