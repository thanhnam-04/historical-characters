import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { VoicePlayer } from "../src/features/chat/voicePlayer.js";

function avatarFixture({ connected = true, nodes = {} } = {}) {
  const handlers = {};
  const source = readFileSync(
    new URL("../public/dragon/avatar.js", import.meta.url),
    "utf8",
  )
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export class DragonAvatar", "class DragonAvatar");
  const sandbox = {
    performance,
    Uint8Array,
    console,
    GLTFLoader: class {
      load(url, loaded, progress, failed) {
        Object.assign(handlers, { loaded, progress, failed });
      }
    },
    document: {
      querySelector() {
        throw Error("Must not access another mounted avatar globally");
      },
      removeEventListener() {},
    },
    cancelAnimationFrame() {},
    requestAnimationFrame() {
      throw Error("A destroyed avatar must not schedule a frame");
    },
  };
  const DragonAvatar = vm.runInNewContext(source + "\nDragonAvatar;", sandbox);
  const avatar = Object.create(DragonAvatar.prototype);
  avatar.stage = {
    isConnected: connected,
    querySelector: (selector) => nodes[selector] ?? null,
  };
  avatar.host = { isConnected: connected };
  avatar.ready = true;
  avatar.destroyed = false;
  avatar.lip = { setViseme() {} };
  return { avatar, handlers };
}

test("Stopping voice after the stage is detached or its labels are missing is safe", () => {
  for (const connected of [true, false]) {
    const { avatar, handlers } = avatarFixture({ connected });
    assert.doesNotThrow(() => avatar.beginSpeech());
    assert.doesNotThrow(() => avatar.endSpeech());
    avatar.load();
    assert.doesNotThrow(() => handlers.progress({ loaded: 1, total: 2 }));
    assert.doesNotThrow(() => handlers.failed());
  }
});

test("Speech updates belong to their own mounted stage and are ignored after teardown", () => {
  const label = { textContent: "" },
    mouth = { textContent: "" };
  const { avatar } = avatarFixture({
    nodes: { "#avatarState": label, "#mouthLabel": mouth },
  });
  avatar.beginSpeech();
  assert.equal(label.textContent, "Long Vân đang nói");
  avatar.endSpeech();
  assert.equal(mouth.textContent, "Rồng 3D tương tác");
  avatar.stage.isConnected = false;
  label.textContent = "detached";
  avatar.beginSpeech();
  avatar.endSpeech();
  assert.equal(label.textContent, "detached");
  avatar.destroyed = true;
  assert.doesNotThrow(() => avatar.tick(100));
});

function speechEnvironment(t) {
  const saved = {};
  for (const key of [
    "window",
    "SpeechSynthesisUtterance",
    "AudioContext",
    "fetch",
  ])
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  t.after(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
  });
  const spoken = [];
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      getVoices: () => [{ lang: "vi-VN" }],
      speak: (utterance) => spoken.push(utterance),
    },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return { spoken };
}

test("Browser speech callbacks cannot update state or revive the avatar after disposal", async (t) => {
  const { spoken } = speechEnvironment(t);
  const { avatar } = avatarFixture({ connected: false });
  const states = [];
  const player = new VoicePlayer(avatar, (value) => states.push(value));
  await player.play({ text: "Xin chào", engine: "browser", csrf: "" });
  const utterance = spoken[0];
  player.dispose();
  const before = states.length;
  assert.doesNotThrow(() => {
    utterance.onstart();
    utterance.onend();
    utterance.onerror();
    player.dispose();
  });
  assert.equal(states.length, before);
  assert.equal(player.avatar, null);
  await player.play({ text: "late", engine: "browser", csrf: "" });
  assert.equal(spoken.length, 1);
});

test("Disposal during AudioContext.resume aborts playback before a network request", async (t) => {
  speechEnvironment(t);
  let resume,
    calls = 0,
    closed = 0;
  globalThis.AudioContext = class {
    state = "suspended";
    resume() {
      return new Promise((resolve) => {
        resume = resolve;
      });
    }
    close() {
      closed++;
      this.state = "closed";
      return Promise.resolve();
    }
  };
  globalThis.fetch = async () => {
    calls++;
    throw Error("A disposed player must not request TTS");
  };
  const player = new VoicePlayer(
    avatarFixture({ connected: false }).avatar,
    () => {},
  );
  const pending = player.play({
    text: "Xin chào",
    engine: "openrouter",
    csrf: "",
  });
  player.dispose();
  resume();
  await pending;
  assert.equal(calls, 0);
  assert.equal(closed, 1);
  assert.equal(player.context, null);
});

test("A late TTS response cannot start audio or change state after leaving chat", async (t) => {
  speechEnvironment(t);
  let resolveFetch,
    enteredFetch,
    started = 0;
  const fetched = new Promise((resolve) => {
    enteredFetch = resolve;
  });
  globalThis.AudioContext = class {
    state = "running";
    resume() {
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    createBufferSource() {
      started++;
    }
  };
  globalThis.fetch = () => {
    enteredFetch();
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };
  const states = [];
  const player = new VoicePlayer(
    avatarFixture({ connected: false }).avatar,
    (state) => states.push(state),
  );
  const pending = player.play({
    text: "Xin chào",
    engine: "openrouter",
    csrf: "",
  });
  await fetched;
  player.dispose();
  const before = states.length;
  resolveFetch(new Response(new Uint8Array(32)));
  await pending;
  assert.equal(started, 0);
  assert.equal(states.length, before);
});

test("Stopping active audio clears the source and closes the context only once", (t) => {
  speechEnvironment(t);
  let stopped = 0,
    closed = 0;
  const player = new VoicePlayer(
    avatarFixture({ connected: false }).avatar,
    () => {},
  );
  const source = {
    onended() {
      throw Error("Stale audio callback");
    },
    stop() {
      stopped++;
      this.onended?.();
    },
  };
  player.source = source;
  player.context = {
    state: "running",
    close() {
      closed++;
      this.state = "closed";
      return Promise.resolve();
    },
  };
  player.stop();
  player.stop();
  player.dispose();
  assert.equal(stopped, 1);
  assert.equal(closed, 1);
  assert.equal(source.onended, null);
});
