import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { DEFAULT_CONFIG } from "./fixtures/config.js";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  if (
    !/navigation.*not implemented|Not implemented: navigation/i.test(
      error.message,
    )
  )
    errors.push(error);
});
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/app",
  pretendToBeVisual: true,
  virtualConsole,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "FormData",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
]) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
dom.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
Object.defineProperty(dom.window.navigator, "clipboard", {
  value: { async writeText() {} },
});

mkdirSync(path.join(rootPath, ".runtime"), { recursive: true });
const bundle = path.join(rootPath, ".runtime/ui-test-components.mjs");
await build({
  absWorkingDir: rootPath,
  entryPoints: ["tests/ui-entry.jsx"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  logLevel: "silent",
});
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const components = await import(pathToFileURL(bundle).href);
after(() => dom.window.close());

const me = {
  user: { id: "owner", name: "Admin", role: "admin", quota: 60 },
  csrf: "csrf-test",
  mode: "password",
  used: 0,
  config: { ...DEFAULT_CONFIG, ready: true, ttsEnabled: false },
};
const payloads = {
  overview: {
    stats: {
      users: 1,
      activeUsers: 1,
      conversations: 0,
      messages: 0,
      requestsToday: 0,
      errorsToday: 0,
    },
    daily: [],
    recent: [],
    ready: true,
  },
  config: {
    config: { ...DEFAULT_CONFIG },
    keyConfigured: true,
    keySource: "database",
    mode: "password",
  },
  users: {
    items: [{ ...me.user, email: "admin@example.com", status: "active" }],
    ownerId: "owner",
  },
  conversations: { items: [], hasMore: false },
  audit: { items: [], hasMore: false },
  models: { items: [] },
};
function apiStub(overrides = {}) {
  return async (url, options = {}) => {
    const key = String(url).replace("/api/", "").split("?")[0];
    if (overrides[key]) return overrides[key](options);
    if (key.startsWith("admin/"))
      return Response.json(payloads[key.slice(6)] || { ok: true });
    throw Error("Unexpected UI test request: " + key);
  };
}
async function mount(t, name, props, fetcher = apiStub()) {
  errors.length = 0;
  document.body.innerHTML = '<div id="test-root"></div>';
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById("test-root"), {
    onUncaughtError: (error) => errors.push(error),
    onRecoverableError: (error) => errors.push(error),
  });
  const render = async (values) =>
    act(async () => root.render(React.createElement(components[name], values)));
  await render(props);
  t.after(async () => {
    await act(async () => root.unmount());
    assert.equal(errors.length, 0, errors.map((e) => e.stack).join("\n"));
  });
  return render;
}
async function until(condition) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 15)));
  }
  assert(condition(), "UI did not settle");
}
const button = (label) =>
  Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent.trim() === label,
  );
async function click(element) {
  assert(element);
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}
async function fill(selector, value) {
  const element = document.querySelector(selector);
  const prototype =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit(form) {
  await act(async () =>
    form.dispatchEvent(
      new dom.window.SubmitEvent("submit", { bubbles: true, cancelable: true }),
    ),
  );
}

test("All admin views switch safely and the config form receives its own model", async (t) => {
  const props = { me, notify() {}, onNavigate() {}, refreshMe: async () => me };
  const render = await mount(t, "Admin", { ...props, tab: "overview" });
  await until(() => document.querySelector(".stats-grid"));
  for (const tab of [
    "config",
    "users",
    "conversations",
    "audit",
    "overview",
    "config",
  ]) {
    await render({ ...props, tab });
    await until(() => !document.querySelector(".dashboard .spin"));
    if (tab === "config")
      assert.equal(
        document.querySelector('input[name="chatModel"]').value,
        DEFAULT_CONFIG.chatModel,
      );
  }
});

test("Admin loading errors can retry and account dialogs close with Escape", async (t) => {
  let fail = true;
  await mount(
    t,
    "Admin",
    { tab: "users", me, notify() {}, refreshMe: async () => me },
    apiStub({
      "admin/users": () =>
        Response.json(fail ? { error: "Mất kết nối" } : payloads.users, {
          status: fail ? 503 : 200,
        }),
    }),
  );
  await until(() => button("Thử lại"));
  fail = false;
  await click(button("Thử lại"));
  await until(() => document.querySelector("table"));
  await click(button("Thêm người dùng"));
  assert(document.querySelector('[role="dialog"]'));
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  assert(!document.querySelector('[role="dialog"]'));
});

test("Login retry and password confirmation do not submit mismatched passwords", async (t) => {
  let fail = true,
    submissions = 0;
  await mount(
    t,
    "Login",
    {},
    apiStub({
      "auth/status": () =>
        Response.json(
          fail
            ? { error: "Tạm mất mạng" }
            : { mode: "password", setupRequired: true, registrationOpen: true },
          { status: fail ? 503 : 200 },
        ),
      "auth/setup": () => {
        submissions++;
        return Response.json({ ok: true });
      },
    }),
  );
  await until(() => button("Thử lại"));
  fail = false;
  await click(button("Thử lại"));
  await until(() => document.querySelector('input[name="confirm"]'));
  await fill('input[name="password"]', "Password-123456");
  await fill('input[name="confirm"]', "Other-123456");
  await submit(document.querySelector("form"));
  assert(
    document.querySelector('[role="alert"]').textContent.includes("chưa khớp"),
  );
  assert.equal(submissions, 0);
});

test("Chat renders streamed Vietnamese and can unmount after voice stop", async (t) => {
  const story = { id: "story", title: "Câu chuyện", deleted_at: null };
  const answer = {
    id: "answer",
    role: "assistant",
    content: "Xin chào bạn!",
    created_at: Date.now(),
  };
  const sse = `event: meta\ndata: {"userMessageId":"sent"}\n\nevent: delta\ndata: {"text":"Xin chào bạn!"}\n\nevent: done\ndata: ${JSON.stringify({ message: answer })}\n\n`;
  await mount(
    t,
    "Chat",
    {
      me,
      conversation: story,
      archived: false,
      notify() {},
      onRefresh() {},
      onCreate() {},
      onArchived() {},
    },
    apiStub({
      "conversations/story": () =>
        Response.json({ conversation: story, messages: [], hasMore: false }),
      "conversations/story/messages": () =>
        new Response(sse, { headers: { "Content-Type": "text/event-stream" } }),
    }),
  );
  await until(() => !document.querySelector(".messages .spin"));
  await fill(".composer textarea", "Chào rồng");
  await submit(document.querySelector(".composer"));
  await until(
    () =>
      document.querySelector(".message.assistant .bubble")?.textContent ===
      "Xin chào bạn!",
  );
  assert(
    document.querySelector(".message.user .bubble").textContent === "Chào rồng",
  );
});

test("Character upload keeps the uploaded model selected for preview before applying", async (t) => {
  const previousXHR = globalThis.XMLHttpRequest;
  const uploaded = {
    id: "new-model",
    name: "Nhân vật mới",
    url: "/api/characters/new-model/model",
    bytes: 100,
    builtin: false,
  };
  let saved = 0,
    submitted = false;
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    open(method, url) {
      assert.equal(method, "POST");
      assert(url.startsWith("/api/admin/characters?name="));
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    send(file) {
      assert.equal(file.name, "new.glb");
      assert.equal(this.headers["X-CSRF-Token"], me.csrf);
      submitted = true;
      this.status = 201;
      this.responseText = JSON.stringify(uploaded);
      this.onload();
    }
    abort() {}
  };
  t.after(() => {
    globalThis.XMLHttpRequest = previousXHR;
  });
  await mount(
    t,
    "Characters",
    {
      data: {
        activeId: "default",
        items: [
          {
            id: "default",
            name: "Long Vân",
            url: "/dragon/assets/dragon.glb",
            builtin: true,
          },
        ],
      },
      me,
      notify() {},
      onSaved() {
        saved++;
      },
    },
    apiStub({
      "admin/characters/active": (options) => {
        assert.equal(JSON.parse(options.body).id, "new-model");
        return Response.json({ ok: true });
      },
    }),
  );
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", {
    value: [new dom.window.File(["model"], "new.glb")],
    configurable: true,
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await submit(document.querySelector(".character-upload"));
  await until(() =>
    document
      .querySelector(".model-option.selected")
      ?.textContent.includes("Nhân vật mới"),
  );
  assert(submitted);
  assert.equal(saved, 0);
  await click(button("Áp dụng cho người dùng"));
  assert.equal(saved, 1);
});

test('GPT and premium voices unlock only when admin disables free-only in the draft', async t=>{
  const models=[
    {id:'openai/gpt-test',name:'GPT test',output:['text'],voices:[],free:false},
    {id:'google/gemini-3.8-flash-tts',name:'Gemini TTS',output:['speech'],voices:['Sulafat','Aoede','Puck'],free:false},
    {id:'fish-audio/s2.1-pro-free:free',name:'Fish free',output:['speech'],voices:[],free:true},
  ];
  let saved=null;
  const props={tab:'config',me,notify(){},refreshMe:async()=>me};
  await mount(t,'Admin',props,apiStub({'admin/models':()=>Response.json({items:models}),'admin/config':options=>{if(options.method==='PATCH'){saved=JSON.parse(options.body);return Response.json({ok:true});}return Response.json(payloads.config);}}));
  await until(()=>document.querySelector('select[aria-label="Chọn model GPT"]')?.options.length===2);
  assert(document.querySelector('select[aria-label="Chọn model GPT"]').disabled);
  assert(button('Sulafat · Ấm áp').disabled);
  await click(document.querySelector('input[name="freeOnly"]'));
  assert(!document.querySelector('select[aria-label="Chọn model GPT"]').disabled);
  const select=document.querySelector('select[aria-label="Chọn model GPT"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'openai/gpt-test');
  await act(async()=>select.dispatchEvent(new Event('change',{bubbles:true})));
  await click(button('Sulafat · Ấm áp'));
  assert.equal(document.querySelector('select[name="ttsVoice"]').value,'Sulafat');
  await submit(document.querySelector('.settings-grid'));
  await until(()=>saved);
  assert.equal(saved.config.chatModel,'openai/gpt-test');
  assert.equal(saved.config.ttsModel,'google/gemini-3.8-flash-tts');
  assert.equal(saved.config.ttsVoice,'Sulafat');
  assert.equal(saved.config.freeOnly,false);
});
