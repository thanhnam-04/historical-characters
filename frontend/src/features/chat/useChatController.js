import { useCallback, useEffect, useRef, useState } from "react";

import { api, write } from "../../services/api.js";
import { VoicePlayer } from "./voicePlayer.js";
export function useChatController({
  me,
  conversation,
  archived,
  notify,
  onCreate,
  onRefresh,
  onArchived,
  resetToken = 0,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [read, setRead] = useState(true);
  const [listening, setListening] = useState(false);
  const [title, setTitle] = useState("");
  const activeId = useRef(null);
  const abort = useRef(null);
  const epoch = useRef(0);
  const bottom = useRef(null);
  const voice = useRef(null);
  const avatar = useRef(null);
  const recognition = useRef(null);
  const lastReset = useRef(resetToken);
  const readRef = useRef(true);
  const skipScroll = useRef(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [olderCursor, setOlderCursor] = useState(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const switching =
    (conversation?.id || null) !== activeId.current ||
    resetToken !== lastReset.current;
  const avatarReady = useCallback((a) => {
    avatar.current = a;
    if (voice.current) voice.current.avatar = a;
  }, []);
  useEffect(() => {
    const player = new VoicePlayer(avatar.current, setPlaying);
    voice.current = player;
    const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (speech) {
      const r = new speech();
      r.lang = "vi-VN";
      r.interimResults = true;
      r.onstart = () => setListening(true);
      r.onresult = (e) => {
        let value = "";
        for (let i = 0; i < e.results.length; i++)
          value += e.results[i][0].transcript;
        setInput(value);
      };
      r.onend = () => setListening(false);
      r.onerror = (e) => {
        setListening(false);
        notify(
          e.error === "not-allowed"
            ? "Hãy cấp quyền micro cho trang web."
            : e.error === "network"
              ? "Nhận giọng nói cần kết nối mạng. Bạn có thể gõ tin nhắn."
              : "Chưa nhận được giọng nói. Thử lại hoặc gõ tin nhắn.",
        );
      };
      recognition.current = r;
    }
    const hidden = () => {
      if (document.hidden) recognition.current?.stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      epoch.current++;
      abort.current?.abort();
      if (recognition.current) {
        recognition.current.onstart =
          recognition.current.onresult =
          recognition.current.onend =
          recognition.current.onerror =
            null;
        recognition.current.abort();
      }
      player.dispose();
      if (voice.current === player) voice.current = null;
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    const id = conversation?.id || null;
    if (id === activeId.current && resetToken === lastReset.current) {
      if (conversation) setTitle(conversation.title);
      return;
    }
    activeId.current = id;
    lastReset.current = resetToken;
    epoch.current++;
    abort.current?.abort();
    setBusy(false);
    voice.current?.stop();
    setInput("");
    setMessages([]);
    setHasOlder(false);
    setOlderCursor(null);
    setOlderBusy(false);
    setTitle(conversation?.title || "");
    if (!id) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    api("conversations/" + id, { signal: controller.signal })
      .then((d) => {
        if (!cancelled) {
          setMessages(d.messages);
          setTitle(d.conversation.title);
          setHasOlder(!!d.hasMore);
          setOlderCursor(d.before || null);
        }
      })
      .catch((e) => {
        if (!cancelled) notify(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [conversation?.id, resetToken]);
  useEffect(() => {
    if (conversation?.title) setTitle(conversation.title);
  }, [conversation?.title]);
  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);
  async function play(message) {
    if (!me.config.ttsEnabled) {
      notify("Admin đang tắt giọng đọc.");
      return;
    }
    try {
      await voice.current?.play({
        text:
          message?.content ||
          "Xin chào! Mình là Long Vân, người bạn rồng của bạn.",
        messageId: message?.id,
        sample: !message,
        engine: me.config.ttsEngine,
        csrf: me.csrf,
      });
      onRefresh();
    } catch (e) {
      notify(e.message);
    }
  }
  async function send(text = input) {
    if (archived && !conversation) {
      notify("Chọn một hội thoại đã lưu trữ để xem lại.");
      return;
    }
    if (busy || loading || switching || !text.trim()) return;
    if (!me.config.ready) {
      notify("Admin cần cấu hình OpenRouter trước khi bắt đầu chat.");
      return;
    }
    if (conversation?.deleted_at) {
      notify("Khôi phục cuộc trò chuyện trước khi gửi tiếp.");
      return;
    }
    voice.current?.stop();
    recognition.current?.stop();
    setBusy(true);
    setInput("");
    const run = ++epoch.current;
    const controller = new AbortController();
    abort.current = controller;
    let conversationId = activeId.current;
    try {
      if (!conversationId) {
        const d = await api(
          "conversations",
          {
            method: "POST",
            body: JSON.stringify({}),
            signal: controller.signal,
          },
          me.csrf,
        );
        if (run !== epoch.current) return;
        conversationId = d.conversation.id;
        activeId.current = conversationId;
        setTitle(text.slice(0, 65));
        onCreate({ ...d.conversation, title: text.slice(0, 65) });
      }
      const userMessage = {
        id: "local-user-" + run,
        role: "user",
        content: text.trim(),
        created_at: Date.now(),
      };
      const answer = {
        id: "local-answer-" + run,
        role: "assistant",
        content: "",
        created_at: Date.now(),
      };
      setMessages((m) => [...m, userMessage, answer]);
      const res = await fetch(
        "/api/conversations/" + conversationId + "/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": me.csrf,
          },
          body: JSON.stringify({ content: text.trim() }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Chưa gửi được tin nhắn.");
      }
      if (!res.body) throw new Error("Không nhận được dữ liệu từ máy chủ.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "";
      let final = null;
      const line = (s) => {
        if (s.startsWith("event:")) event = s.slice(6).trim();
        if (s.startsWith("data:")) {
          const data = JSON.parse(s.slice(5));
          if (run !== epoch.current) return;
          if (event === "delta") {
            answer.content += data.text;
            setMessages((m) =>
              m.map((x) => (x.id === answer.id ? { ...answer } : x)),
            );
          } else if (event === "meta") {
            setMessages((m) =>
              m.map((x) =>
                x.id === userMessage.id ? { ...x, id: data.userMessageId } : x,
              ),
            );
          } else if (event === "error") notify(data.error);
          else if (event === "done") {
            final = data.message;
            if (data.message)
              setMessages((m) =>
                m.map((x) => (x.id === answer.id ? data.message : x)),
              );
            else setMessages((m) => m.filter((x) => x.id !== answer.id));
          }
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const s of lines) line(s.replace(/\r$/, ""));
      }
      if (buffer.trim()) line(buffer.trim());
      if (run === epoch.current) {
        onRefresh();
        if (
          readRef.current &&
          me.config.ttsEnabled &&
          me.config.ttsEngine !== "off" &&
          final
        )
          play(final);
      }
    } catch (e) {
      if (run !== epoch.current) return;
      if (e.name !== "AbortError") notify(e.message);
      if (conversationId) {
        try {
          const recovery = new AbortController();
          abort.current = recovery;
          let d = await api("conversations/" + conversationId, {
            signal: recovery.signal,
          });
          for (
            let attempt = 0;
            e.name === "AbortError" &&
            d.inFlight &&
            attempt < 12 &&
            run === epoch.current;
            attempt++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (run !== epoch.current) return;
            d = await api("conversations/" + conversationId, {
              signal: recovery.signal,
            });
          }
          if (run === epoch.current) {
            setMessages((previous) => {
              const partial = previous.find(
                (message) =>
                  message.id === "local-answer-" + run && message.content,
              );
              return e.name === "AbortError" &&
                partial &&
                !d.messages.some(
                  (message) =>
                    message.role === "assistant" &&
                    message.content === partial.content,
                )
                ? [...d.messages, { ...partial, status: "interrupted" }]
                : d.messages;
            });
            setHasOlder(!!d.hasMore);
            setOlderCursor(d.before || null);
            if (
              e.name !== "AbortError" &&
              !d.messages.some(
                (message) =>
                  message.role === "user" && message.content === text.trim(),
              )
            )
              setInput(text);
          }
        } catch {}
      }
    } finally {
      if (run === epoch.current) {
        setBusy(false);
        abort.current = null;
        onRefresh();
      }
    }
  }
  async function editTitle(e) {
    e.preventDefault();
    if (!conversation) return;
    try {
      await write(
        "conversations/" + conversation.id,
        { title: renameDraft },
        me.csrf,
        "PATCH",
      );
      setTitle(renameDraft);
      document.getElementById("rename").close();
      onRefresh();
      notify("Đã đổi tên cuộc trò chuyện.");
    } catch (e) {
      notify(e.message);
    }
  }
  async function archive() {
    if (!conversation) return;
    try {
      await write(
        "conversations/" + conversation.id,
        { archived: !conversation.deleted_at },
        me.csrf,
        "PATCH",
      );
      onArchived();
      notify(
        conversation.deleted_at
          ? "Đã khôi phục hội thoại."
          : "Đã chuyển hội thoại vào mục lưu trữ.",
      );
    } catch (e) {
      notify(e.message);
    }
  }
  function mic() {
    if (!recognition.current) {
      notify(
        "Trình duyệt chưa hỗ trợ nhận giọng nói. Thử Chrome hoặc Edge, hoặc gõ tin nhắn.",
      );
      return;
    }
    voice.current?.stop();
    if (listening) recognition.current.stop();
    else
      try {
        recognition.current.start();
      } catch {
        notify("Micro đang bận. Thử lại sau một chút.");
      }
  }
  async function loadOlder() {
    const id = activeId.current;
    const run = epoch.current;
    if (!id || !hasOlder || !olderCursor || olderBusy) return;
    setOlderBusy(true);
    try {
      const data = await api(
        "conversations/" + id + "?before=" + encodeURIComponent(olderCursor),
      );
      if (run !== epoch.current) return;
      skipScroll.current = true;
      setMessages((list) => [
        ...data.messages.filter(
          (message) => !list.some((existing) => existing.id === message.id),
        ),
        ...list,
      ]);
      setHasOlder(!!data.hasMore);
      setOlderCursor(data.before || null);
    } catch (e) {
      if (run === epoch.current) notify(e.message);
    } finally {
      if (run === epoch.current) setOlderBusy(false);
    }
  }

  return {
    messages,
    input,
    setInput,
    busy,
    loading,
    playing,
    read,
    setRead,
    listening,
    title,
    switching,
    avatarReady,
    renameDraft,
    setRenameDraft,
    olderBusy,
    hasOlder,
    bottom,
    readRef,
    voice,
    play,
    send,
    editTitle,
    archive,
    mic,
    loadOlder,
    abort,
  };
}
