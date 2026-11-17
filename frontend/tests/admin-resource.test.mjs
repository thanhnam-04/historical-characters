import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminResourceKey,
  loadedAdminResource,
  selectAdminResource,
} from "../src/utils/adminResource.js";
import { DEFAULT_CONFIG } from "./fixtures/config.js";

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
    ready: false,
  },
  config: {
    config: { ...DEFAULT_CONFIG },
    keyConfigured: false,
    mode: "password",
  },
  users: { items: [], ownerId: "owner" },
  conversations: { items: [] },
  audit: { items: [] },
};
const key = (tab, query = "", offset = 0, revision = 0) =>
  adminResourceKey(tab, query, offset, revision);

test("Switching all admin tabs hides the previous payload before effects run", () => {
  for (const from of Object.keys(payloads))
    for (const to of Object.keys(payloads)) {
      const old = loadedAdminResource(key(from), from, payloads[from]);
      const selected = selectAdminResource(old, key(to));
      if (from === to) assert.equal(selected.data, payloads[from]);
      else {
        assert.equal(
          selected.data,
          null,
          `${from} payload must not render as ${to}`,
        );
        assert.equal(selected.loading, true);
      }
    }
});

test("Overview to AI config waits for real config, then exposes the saved chat model", () => {
  const overview = loadedAdminResource(
    key("overview"),
    "overview",
    payloads.overview,
  );
  const pending = selectAdminResource(overview, key("config"));
  assert.equal(pending.data, null);
  assert.equal(pending.loading, true);
  const config = loadedAdminResource(key("config"), "config", payloads.config);
  const ready = selectAdminResource(config, key("config"));
  assert.equal(ready.data.config.chatModel, DEFAULT_CONFIG.chatModel);
  assert.equal(ready.loading, false);
});

test("Late responses from an earlier tab cannot populate the active tab", () => {
  const active = key("config");
  for (const previous of ["overview", "users", "conversations", "audit"]) {
    const lateResponse = loadedAdminResource(
      key(previous),
      previous,
      payloads[previous],
    );
    assert.equal(selectAdminResource(lateResponse, active).data, null);
  }
});

test("Search, pagination and reload each isolate their own request", () => {
  const previous = loadedAdminResource(key("users", "old", 0, 0), "users", {
    items: [{ id: "old-user" }],
  });
  for (const next of [
    key("users", "new", 0, 0),
    key("users", "old", 50, 0),
    key("users", "old", 0, 1),
  ]) {
    assert.equal(selectAdminResource(previous, next).loading, true);
    assert.equal(selectAdminResource(previous, next).data, null);
  }
});

test("Missing or malformed config becomes a retryable error instead of a render crash", () => {
  for (const invalid of [
    undefined,
    null,
    {},
    payloads.overview,
    { config: {} },
    { ...payloads.config, config: { ...DEFAULT_CONFIG, chatModel: undefined } },
  ]) {
    const snapshot = loadedAdminResource(key("config"), "config", invalid);
    const selected = selectAdminResource(snapshot, key("config"));
    assert.equal(selected.data, null);
    assert.equal(selected.loading, false);
    assert.equal(typeof selected.error, "string");
  }
});

test("A failed request does not leak its data into a retry or another tab", () => {
  const failed = {
    key: key("config"),
    status: "error",
    data: payloads.overview,
    error: "Request failed",
  };
  assert.equal(selectAdminResource(failed, key("config")).data, null);
  assert.equal(
    selectAdminResource(failed, key("config")).error,
    "Request failed",
  );
  assert.equal(
    selectAdminResource(failed, key("config", "", 0, 1)).loading,
    true,
  );
  assert.equal(selectAdminResource(failed, key("users")).error, null);
});
