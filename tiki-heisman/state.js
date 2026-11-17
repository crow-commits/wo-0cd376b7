/**
 * Tiki Heisman counter state.
 *
 * The overlay is a follower: it displays the count and subscribes to updates.
 * The controller is a publisher: +1 / -1 / set / reset, plus visibility/anim flags.
 *
 * Transport:
 *   - BroadcastChannel + localStorage + postMessage for a same-device fast path
 *   - ntfy.sh public pub/sub for live updates across phones and IRL Toolkit / OBS
 *
 * There is no login and no secret. Anyone who opens the controller URL can
 * change the overlay. The ntfy topic is a long, fixed name in this file.
 *
 * Hosted message body: { type, count, rev, at, ts, source,
 *   cardVisible, trophyVisible, cardAnim, trophyAnim }.
 * Last-writer-wins by rev, then ts/at.
 */
(function (root) {
  "use strict";

  var GOAL = 100000;
  var MAX = 999999;
  var NS = "tiki-heisman-counter";
  var HOSTED_TOPIC = "tiki-heisman-ca75d64ada945aa2";
  var NTFY_BASE = "https://ntfy.sh";
  var PUBLISH_GAP_MS = 250; // at most ~4 hosted publishes per second
  var POLL_TIMEOUT_MS = 4000;
  var MAX_BACKOFF_MS = 8000;

  function clamp(n) {
    n = typeof n === "string" && n.trim() !== "" ? Number(n) : Number(n);
    if (!isFinite(n)) return 0;
    n = Math.round(n);
    if (n < 0) return 0;
    if (n > MAX) return MAX;
    return n;
  }

  function format(n) {
    n = clamp(n);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function safeRoom(raw) {
    var room = String(raw || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 40);
    return room || "default";
  }

  function safeTopic(raw) {
    var topic = String(raw || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 80);
    return topic || HOSTED_TOPIC;
  }

  function hostedTopic(opts) {
    opts = opts || {};
    if (opts.topic) return safeTopic(opts.topic);
    if (typeof window !== "undefined" && window.location && window.location.search) {
      try {
        var q = new URLSearchParams(window.location.search).get("topic");
        if (q) return safeTopic(q);
      } catch (err) {}
    }
    return HOSTED_TOPIC;
  }

  function defaultFlags() {
    return {
      cardVisible: true,
      trophyVisible: true,
      cardAnim: true,
      trophyAnim: true
    };
  }

  function normalizeFlags(src, fallback) {
    var base = fallback ? {
      cardVisible: fallback.cardVisible !== false,
      trophyVisible: fallback.trophyVisible !== false,
      cardAnim: fallback.cardAnim !== false,
      trophyAnim: fallback.trophyAnim !== false
    } : defaultFlags();
    if (!src || typeof src !== "object") return base;
    return {
      cardVisible: "cardVisible" in src ? !!src.cardVisible : base.cardVisible,
      trophyVisible: "trophyVisible" in src ? !!src.trophyVisible : base.trophyVisible,
      cardAnim: "cardAnim" in src ? !!src.cardAnim : base.cardAnim,
      trophyAnim: "trophyAnim" in src ? !!src.trophyAnim : base.trophyAnim
    };
  }

  function flagsEqual(a, b) {
    return a.cardVisible === b.cardVisible &&
      a.trophyVisible === b.trophyVisible &&
      a.cardAnim === b.cardAnim &&
      a.trophyAnim === b.trophyAnim;
  }

  function msgTime(msg) {
    if (!msg || typeof msg !== "object") return 0;
    return Number(msg.ts || msg.at) || 0;
  }

  function coerceState(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.type === "hello") return raw;
    if (raw.type && raw.type !== "state") return null;
    if (raw.count == null && raw.rev == null) return null;
    var out = {
      type: "state",
      count: clamp(raw.count),
      rev: Number(raw.rev) || 0,
      at: msgTime(raw) || Date.now(),
      ts: msgTime(raw) || Date.now(),
      source: raw.source || "",
      cardVisible: raw.cardVisible !== false,
      trophyVisible: raw.trophyVisible !== false,
      cardAnim: raw.cardAnim !== false,
      trophyAnim: raw.trophyAnim !== false
    };
    return out;
  }

  function stateWins(incoming, current) {
    if (!incoming) return false;
    if (!current) return true;
    var ir = Number(incoming.rev) || 0;
    var cr = Number(current.rev) || 0;
    if (ir !== cr) return ir > cr;
    return msgTime(incoming) > msgTime(current);
  }

  function parseNtfyEnvelope(raw) {
    if (!raw) return null;
    var env = raw;
    if (typeof raw === "string") {
      try { env = JSON.parse(raw); } catch (err) { return null; }
    }
    if (!env || typeof env !== "object") return null;
    if (env.event && env.event !== "message") return null;
    var body = env.message != null ? env.message : env;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (err) { return null; }
    }
    return coerceState(body);
  }

  function parseNtfyPollBody(text) {
    if (!text || !String(text).trim()) return null;
    var latest = null;
    var lines = String(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var msg = parseNtfyEnvelope(line);
      if (msg && stateWins(msg, latest)) latest = msg;
    }
    return latest;
  }

  function createLocalTransport(opts) {
    opts = opts || {};
    var room = safeRoom(opts.room);
    var channelName = NS + ":" + room;
    var storageKey = channelName;
    var listeners = [];
    var channel = null;

    function emit(msg) {
      if (!msg || typeof msg !== "object") return;
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](msg); } catch (err) {}
      }
    }

    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = function (ev) { emit(ev.data); };
      } catch (err) {
        channel = null;
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("storage", function (ev) {
        if (ev.key !== storageKey || !ev.newValue) return;
        try { emit(JSON.parse(ev.newValue)); } catch (err) {}
      });
      window.addEventListener("message", function (ev) {
        var data = ev.data;
        if (!data || data.ns !== NS || data.room !== room) return;
        emit(data.payload);
      });
    }

    function send(msg) {
      if (channel) {
        try { channel.postMessage(msg); } catch (err) {}
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(msg));
      } catch (err) {}
      if (typeof window !== "undefined") {
        var envelope = { ns: NS, room: room, payload: msg };
        var targetOrigin = (window.location && window.location.protocol === "file:") ? "*" : window.location.origin;
        if (window.parent && window.parent !== window) {
          try { window.parent.postMessage(envelope, targetOrigin === "null" ? "*" : targetOrigin); } catch (err) {}
        }
        if (typeof opts.getPeers === "function") {
          var peers = opts.getPeers() || [];
          for (var i = 0; i < peers.length; i++) {
            try { peers[i].postMessage(envelope, "*"); } catch (err) {}
          }
        }
      }
    }

    return {
      kind: "local",
      room: room,
      storageKey: storageKey,
      subscribe: function (fn) { listeners.push(fn); },
      send: send,
      emit: emit,
      readStored: function () {
        try {
          var raw = localStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        } catch (err) {
          return null;
        }
      },
      close: function () {
        if (channel) {
          try { channel.close(); } catch (err) {}
          channel = null;
        }
      }
    };
  }

  function createLiveTransport(opts) {
    opts = opts || {};
    var local = createLocalTransport(opts);
    var topic = hostedTopic(opts);
    var listeners = [];
    var statusListeners = [];
    var status = "reconnecting";
    var es = null;
    var closed = false;
    var pending = null;
    var flushTimer = 0;
    var lastPublishAt = 0;
    var backoff = 500;
    var reconnectTimer = 0;
    var fails = 0;
    var remoteLatest = null;
    var readyDone = false;
    var readyWaiters = [];

    function emit(msg, via) {
      if (!msg || typeof msg !== "object") return;
      if (via === "hosted") {
        var state = coerceState(msg);
        if (state) remoteLatest = state;
      }
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](msg); } catch (err) {}
      }
    }

    local.subscribe(function (msg) { emit(msg, "local"); });

    function setStatus(next) {
      if (status === next) return;
      status = next;
      for (var i = 0; i < statusListeners.length; i++) {
        try { statusListeners[i](status); } catch (err) {}
      }
    }

    function finishReady() {
      if (readyDone) return;
      readyDone = true;
      for (var i = 0; i < readyWaiters.length; i++) {
        try { readyWaiters[i](remoteLatest); } catch (err) {}
      }
      readyWaiters = [];
    }

    var publishRetries = 0;

    function retryPublish(msg) {
      if (closed) return;
      if (!pending) pending = msg;
      if (flushTimer) return;
      publishRetries += 1;
      if (publishRetries > 8) return;
      var wait = Math.min(MAX_BACKOFF_MS, 400 * publishRetries);
      flushTimer = setTimeout(flushPublish, wait);
    }

    function publishNow(msg) {
      if (closed || !msg || msg.type !== "state") return;
      var body = {
        type: "state",
        count: msg.count,
        rev: msg.rev,
        at: msg.at || Date.now(),
        ts: msg.ts || msg.at || Date.now(),
        source: msg.source || "",
        cardVisible: msg.cardVisible !== false,
        trophyVisible: msg.trophyVisible !== false,
        cardAnim: msg.cardAnim !== false,
        trophyAnim: msg.trophyAnim !== false
      };
      lastPublishAt = Date.now();
      if (typeof fetch !== "function") {
        fails += 1;
        setStatus(fails >= 3 ? "offline" : "reconnecting");
        retryPublish(msg);
        return;
      }
      fetch(NTFY_BASE + "/" + topic, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) {
          fails += 1;
          if (res.status === 429) backoff = Math.min(MAX_BACKOFF_MS, Math.max(backoff, 2000));
          setStatus(fails >= 3 ? "offline" : "reconnecting");
          retryPublish(msg);
          return;
        }
        fails = 0;
        publishRetries = 0;
        if (status !== "live") setStatus(es ? "live" : "reconnecting");
      }).catch(function () {
        fails += 1;
        setStatus(fails >= 3 ? "offline" : "reconnecting");
        retryPublish(msg);
      });
    }

    function flushPublish() {
      flushTimer = 0;
      if (!pending) return;
      var msg = pending;
      pending = null;
      publishNow(msg);
    }

    function queuePublish(msg) {
      if (!msg || msg.type !== "state") return;
      pending = msg;
      if (flushTimer) return;
      var wait = Math.max(0, PUBLISH_GAP_MS - (Date.now() - lastPublishAt));
      flushTimer = setTimeout(flushPublish, wait);
    }

    function pollLatest() {
      if (typeof fetch !== "function") {
        return Promise.resolve(null);
      }
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (err) {}
      }, POLL_TIMEOUT_MS);
      return fetch(NTFY_BASE + "/" + topic + "/json?poll=1&since=all", {
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) return null;
        return res.text();
      }).then(function (text) {
        var latest = parseNtfyPollBody(text);
        if (latest) {
          remoteLatest = latest;
          emit(latest, "hosted");
        }
        return latest;
      }).catch(function () {
        clearTimeout(timer);
        return null;
      });
    }

    function openStream() {
      if (closed) return;
      if (typeof EventSource === "undefined") {
        setStatus("offline");
        return;
      }
      try { if (es) es.close(); } catch (err) {}
      var url = NTFY_BASE + "/" + topic + "/sse";
      try {
        es = new EventSource(url);
      } catch (err) {
        scheduleReconnect();
        return;
      }
      es.onopen = function () {
        fails = 0;
        backoff = 500;
        setStatus("live");
        pollLatest();
      };
      es.onmessage = function (ev) {
        var msg = parseNtfyEnvelope(ev.data);
        if (!msg) return;
        fails = 0;
        setStatus("live");
        emit(msg, "hosted");
      };
      es.onerror = function () {
        try { if (es) es.close(); } catch (err2) {}
        es = null;
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (closed) return;
      fails += 1;
      setStatus(fails >= 3 ? "offline" : "reconnecting");
      if (reconnectTimer) return;
      var delay = backoff;
      backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
      reconnectTimer = setTimeout(function () {
        reconnectTimer = 0;
        if (closed) return;
        setStatus("reconnecting");
        publishRetries = 0;
        pollLatest().then(function () {
          openStream();
          if (pending) {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
            flushPublish();
          }
        });
      }, delay);
    }

    function send(msg) {
      local.send(msg);
      queuePublish(msg);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", function () {
        if (closed) return;
        backoff = 500;
        fails = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = 0;
        }
        setStatus("reconnecting");
        pollLatest().then(function () { openStream(); });
      });
      window.addEventListener("offline", function () {
        if (closed) return;
        try { if (es) es.close(); } catch (err) {}
        es = null;
        setStatus("offline");
      });
    }

    // Kick off poll + SSE. Poll first so follow/publish can adopt before announce.
    setStatus("reconnecting");
    function pollThenOpen(attempt) {
      return pollLatest().then(function (latest) {
        finishReady();
        if (attempt === 1) openStream();
        if (!latest && attempt < 4 && !closed) {
          setTimeout(function () { pollThenOpen(attempt + 1); }, 400 * attempt);
        }
      });
    }
    pollThenOpen(1);
    setTimeout(finishReady, POLL_TIMEOUT_MS + 200);

    return {
      kind: "hosted",
      room: local.room,
      topic: topic,
      subscribe: function (fn) { listeners.push(fn); },
      send: send,
      readStored: function () { return local.readStored(); },
      getStatus: function () { return status; },
      onStatus: function (fn) {
        if (typeof fn === "function") {
          statusListeners.push(fn);
          try { fn(status); } catch (err) {}
        }
      },
      whenReady: function () {
        if (typeof Promise !== "function") {
          return { then: function (ok) { if (readyDone) ok(remoteLatest); else readyWaiters.push(ok); } };
        }
        return new Promise(function (resolve) {
          if (readyDone) resolve(remoteLatest);
          else readyWaiters.push(resolve);
        });
      },
      getRemoteLatest: function () { return remoteLatest; },
      close: function () {
        closed = true;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = 0;
          if (pending) publishNow(pending);
        }
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = 0;
        }
        try { if (es) es.close(); } catch (err) {}
        es = null;
        local.close();
      }
    };
  }

  var transportFactory = function (opts) { return createLiveTransport(opts); };

  function createCounter(opts) {
    opts = opts || {};
    var role = opts.role === "publisher" ? "publisher" : "follower";
    var transport = opts.transport || transportFactory({
      room: opts.room,
      topic: opts.topic,
      getPeers: opts.getPeers
    });
    var clientId = opts.id || (role.charAt(0) + Math.random().toString(36).slice(2, 10));
    var count = clamp(opts.initial);
    var flags = normalizeFlags(opts.flags);
    var rev = 0;
    var lastAt = 0;
    var onChange = typeof opts.onChange === "function" ? opts.onChange : function () {};

    function snapshot() {
      var now = Date.now();
      return {
        type: "state",
        count: count,
        rev: rev,
        at: now,
        ts: now,
        source: clientId,
        cardVisible: flags.cardVisible,
        trophyVisible: flags.trophyVisible,
        cardAnim: flags.cardAnim,
        trophyAnim: flags.trophyAnim
      };
    }

    function emitChange(prev, prevFlags, reason, source, at) {
      onChange(count, {
        prev: prev,
        prevFlags: {
          cardVisible: prevFlags.cardVisible,
          trophyVisible: prevFlags.trophyVisible,
          cardAnim: prevFlags.cardAnim,
          trophyAnim: prevFlags.trophyAnim
        },
        flags: {
          cardVisible: flags.cardVisible,
          trophyVisible: flags.trophyVisible,
          cardAnim: flags.cardAnim,
          trophyAnim: flags.trophyAnim
        },
        source: source,
        reason: reason,
        at: at || Date.now()
      });
    }

    function adopt(msg, reason) {
      msg = coerceState(msg);
      if (!msg || msg.type !== "state") return false;
      var incomingRev = Number(msg.rev) || 0;
      var incomingAt = msgTime(msg);
      var nextCount = clamp(msg.count);
      var nextFlags = normalizeFlags(msg, flags);
      var current = { count: count, rev: rev, at: lastAt, ts: lastAt };
      if (incomingRev < rev) return false;
      if (incomingRev === rev && nextCount === count && flagsEqual(nextFlags, flags)) return false;
      if (incomingRev === rev && !stateWins(msg, current)) return false;
      var prev = count;
      var prevFlags = {
        cardVisible: flags.cardVisible,
        trophyVisible: flags.trophyVisible,
        cardAnim: flags.cardAnim,
        trophyAnim: flags.trophyAnim
      };
      count = nextCount;
      flags = nextFlags;
      rev = incomingRev;
      lastAt = incomingAt || Date.now();
      emitChange(prev, prevFlags, reason || "sync", msg.source, lastAt);
      return true;
    }

    transport.subscribe(function (msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "hello") {
        if (role === "publisher") {
          transport.send(snapshot());
        }
        return;
      }
      var state = coerceState(msg);
      if (!state || state.type !== "state") return;
      if (state.source && state.source === clientId) return;
      adopt(state, "remote");
    });

    if (role === "publisher" || opts.useStored !== false) {
      var stored = typeof transport.readStored === "function" ? transport.readStored() : null;
      if (stored) adopt(stored, "stored");
    }

    function commit(next, reason, nextFlags) {
      var prev = count;
      var prevFlags = {
        cardVisible: flags.cardVisible,
        trophyVisible: flags.trophyVisible,
        cardAnim: flags.cardAnim,
        trophyAnim: flags.trophyAnim
      };
      count = clamp(next);
      if (nextFlags) flags = normalizeFlags(nextFlags, flags);
      rev += 1;
      var msg = snapshot();
      lastAt = msg.at;
      transport.send(msg);
      emitChange(prev, prevFlags, reason, clientId, msg.at);
      return count;
    }

    function announce() {
      transport.send(snapshot());
    }

    function hello() {
      transport.send({ type: "hello", at: Date.now(), source: clientId });
    }

    function startNet() {
      if (role === "publisher") {
        var remote = typeof transport.getRemoteLatest === "function" ? transport.getRemoteLatest() : null;
        if (!remote || stateWins(snapshot(), remote)) {
          announce();
        }
      } else {
        hello();
      }
    }

    if (transport && typeof transport.whenReady === "function") {
      var ready = transport.whenReady();
      if (ready && typeof ready.then === "function") {
        ready.then(function (remote) {
          if (remote) adopt(remote, "poll");
          startNet();
        }, function () { startNet(); });
      } else {
        startNet();
      }
    } else {
      startNet();
    }

    return {
      role: role,
      get: function () { return count; },
      getFlags: function () {
        return {
          cardVisible: flags.cardVisible,
          trophyVisible: flags.trophyVisible,
          cardAnim: flags.cardAnim,
          trophyAnim: flags.trophyAnim
        };
      },
      transportKind: transport.kind || "hosted",
      getStatus: function () {
        return transport.getStatus ? transport.getStatus() : (transport.kind || "local");
      },
      onStatus: function (fn) {
        if (transport && typeof transport.onStatus === "function") transport.onStatus(fn);
        else if (typeof fn === "function") fn(transport.kind || "local");
      },
      goal: GOAL,
      max: MAX,
      inc: function () { return commit(count + 1, "inc"); },
      dec: function () { return commit(count - 1, "dec"); },
      set: function (n) { return commit(n, "set"); },
      reset: function () { return commit(0, "reset"); },
      setFlag: function (name, value) {
        if (!Object.prototype.hasOwnProperty.call(flags, name)) return flags;
        if (flags[name] === !!value) return flags;
        var next = {
          cardVisible: flags.cardVisible,
          trophyVisible: flags.trophyVisible,
          cardAnim: flags.cardAnim,
          trophyAnim: flags.trophyAnim
        };
        next[name] = !!value;
        commit(count, "flags", next);
        return flags;
      },
      setFlags: function (partial) {
        commit(count, "flags", normalizeFlags(partial, flags));
        return flags;
      },
      announce: announce,
      sync: role === "publisher" ? announce : hello,
      close: function () {
        if (transport && typeof transport.close === "function") transport.close();
      }
    };
  }

  root.TikiHeismanState = {
    GOAL: GOAL,
    MAX: MAX,
    NS: NS,
    HOSTED_TOPIC: HOSTED_TOPIC,
    clamp: clamp,
    format: format,
    safeRoom: safeRoom,
    defaultFlags: defaultFlags,
    normalizeFlags: normalizeFlags,
    createLocalTransport: createLocalTransport,
    createLiveTransport: createLiveTransport,
    createCounter: createCounter,
    setTransportFactory: function (fn) {
      if (typeof fn === "function") transportFactory = fn;
    }
  };
})(typeof window !== "undefined" ? window : this);
