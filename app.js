(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    fileInput: $("fileInput"),
    recordBtn: $("recordBtn"),
    recordLabel: $("recordLabel"),
    recordHint: $("recordHint"),
    aiBtn: $("aiBtn"),
    editor: $("editor"),
    clipName: $("clipName"),
    clipSub: $("clipSub"),
    undoBtn: $("undoBtn"),
    newClipBtn: $("newClipBtn"),
    wave: $("wave"),
    timeStart: $("timeStart"),
    timeEnd: $("timeEnd"),
    selReadout: $("selReadout"),
    playBtn: $("playBtn"),
    playSelBtn: $("playSelBtn"),
    tStart: $("tStart"),
    tEnd: $("tEnd"),
    fullSelBtn: $("fullSelBtn"),
    applyCutBtn: $("applyCutBtn"),
    echoAmt: $("echoAmt"),
    echoLabel: $("echoLabel"),
    applyEchoBtn: $("applyEchoBtn"),
    layerInput: $("layerInput"),
    layerEmpty: $("layerEmpty"),
    layerLoaded: $("layerLoaded"),
    layerName: $("layerName"),
    volMain: $("volMain"),
    volLayer: $("volLayer"),
    playMixBtn: $("playMixBtn"),
    mergeBtn: $("mergeBtn"),
    clearLayerBtn: $("clearLayerBtn"),
    downloadWavBtn: $("downloadWavBtn"),
    downloadMp3Btn: $("downloadMp3Btn"),
    downloadMp4Btn: $("downloadMp4Btn"),
    overdubBtn: $("overdubBtn"),
    overdubStatus: $("overdubStatus"),
    selVol: $("selVol"),
    selVolLabel: $("selVolLabel"),
    selPitch: $("selPitch"),
    selPitchLabel: $("selPitchLabel"),
    selSpeed: $("selSpeed"),
    selSpeedLabel: $("selSpeedLabel"),
    previewTuneBtn: $("previewTuneBtn"),
    applyTuneBtn: $("applyTuneBtn"),
    vocalAmt: $("vocalAmt"),
    vocalAmtLabel: $("vocalAmtLabel"),
    noiseAmt: $("noiseAmt"),
    noiseAmtLabel: $("noiseAmtLabel"),
    previewNoiseBtn: $("previewNoiseBtn"),
    applyNoiseBtn: $("applyNoiseBtn"),
    stripVoiceBtn: $("stripVoiceBtn"),
    findPartsBtn: $("findPartsBtn"),
    removeVoicePartsBtn: $("removeVoicePartsBtn"),
    segList: $("segList"),
    toast: $("toast"),
    waveB: $("waveB"),
    clipBInput: $("clipBInput"),
    trackA: $("trackA"),
    trackB: $("trackB"),
    trackATitle: $("trackATitle"),
    trackBTitle: $("trackBTitle"),
    timeStartB: $("timeStartB"),
    timeEndB: $("timeEndB"),
    selReadoutB: $("selReadoutB"),
    copyABtn: $("copyABtn"),
    cutABtn: $("cutABtn"),
    pasteOnTopABtn: $("pasteOnTopABtn"),
    pasteOnTopFixedABtn: $("pasteOnTopFixedABtn"),
    pasteInsteadABtn: $("pasteInsteadABtn"),
    copyBBtn: $("copyBBtn"),
    cutBBtn: $("cutBBtn"),
    pasteOnTopBBtn: $("pasteOnTopBBtn"),
    pasteOnTopFixedBBtn: $("pasteOnTopFixedBBtn"),
    pasteInsteadBBtn: $("pasteInsteadBBtn"),
    playBBtn: $("playBBtn"),
    playBSelBtn: $("playBSelBtn"),
    skipBackBtn: $("skipBackBtn"),
    skipFwdBtn: $("skipFwdBtn"),
    skipFwd5Btn: $("skipFwd5Btn"),
    playheadReadout: $("playheadReadout"),
    layerMapStage: $("layerMapStage"),
    layerMapMain: $("layerMapMain"),
    layerMapLayer: $("layerMapLayer"),
    layerMapArrows: $("layerMapArrows"),
    layerMapHint: $("layerMapHint"),
    layerMapAddBtn: $("layerMapAddBtn"),
    layerMapList: $("layerMapList"),
  };

  const state = {
    ctx: null,
    buffer: null,
    layer: null,
    layerName: "",
    name: "Untitled",
    sel: { start: 0, end: 0 },
    mode: "keep",
    history: [],
    playing: false,
    playMix: false,
    playhead: 0,
    playheadA: 0,
    playheadB: 0,
    playTrack: "a",
    playStartedAt: 0,
    playOffset: 0,
    playScale: 1,
    playUntil: null,
    playGen: 0,
    liveGain: null,
    sources: [],
    recorder: null,
    recChunks: [],
    recStart: 0,
    recTimer: null,
    drag: null,
    peaks: null,
    raf: 0,
    waveCache: null,
    segments: [],
    overdubMode: "ontop",
    overdubRec: null,
    overdubStream: null,
    clipB: null,
    nameB: "",
    selB: { start: 0, end: 0 },
    peaksB: null,
    waveCacheB: null,
    clipboard: null,
    pasteMode: "ontop",
    dragTrack: "a",
    layerSel: { start: 0, end: 0 },
    layerDestSel: { start: 0, end: 0 },
    layerMaps: [],
    layerMapMode: "ontop",
    layerMapDrag: null,
    layerMapSeq: 1,
  };

  function audioCtx() {
    if (!state.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Ctx();
    }
    if (state.ctx.state === "suspended") state.ctx.resume();
    return state.ctx;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }
  window.clipcutToast = toast;

  function fmt(sec) {
    if (!Number.isFinite(sec)) return "0.0s";
    return `${sec.toFixed(1)}s`;
  }

  function clampSel() {
    const d = state.buffer ? state.buffer.duration : 0;
    let a = Math.max(0, Math.min(state.sel.start, d));
    let b = Math.max(0, Math.min(state.sel.end, d));
    if (b - a < 0.05) b = Math.min(d, a + 0.05);
    state.sel.start = a;
    state.sel.end = b;
  }

  function pushHistory() {
    if (!state.buffer) return;
    state.history.push(state.buffer);
    if (state.history.length > 4) state.history.shift();
    els.undoBtn.disabled = false;
  }

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });
  }

  function cloneBuffer(buf) {
    const out = new AudioBuffer({
      length: buf.length,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: buf.sampleRate,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c));
    }
    return out;
  }

  async function decodeFile(file) {
    const ctx = audioCtx();
    const data = await file.arrayBuffer();
    return await ctx.decodeAudioData(data.slice(0));
  }

  function setClip(buffer, name, { remember = true, keepSel = false, selectRange = null } = {}) {
    const prevSel = { start: state.sel.start, end: state.sel.end };
    const prevDur = state.buffer ? state.buffer.duration : 0;
    stopPlayback();
    if (remember && state.buffer) pushHistory();
    state.buffer = buffer;
    state.name = name || state.name;
    state.peaks = null;
    state.waveCache = null;
    state.segments = [];
    if (els.segList) els.segList.innerHTML = "";
    if (selectRange) {
      state.sel = { start: selectRange.start, end: selectRange.end };
    } else if (keepSel && Math.abs(buffer.duration - prevDur) < 0.05) {
      state.sel = prevSel;
    } else {
      state.sel = { start: 0, end: buffer.duration };
    }
    state.playheadA = state.sel.start;
    els.editor.classList.remove("hidden");
    els.clipName.textContent = state.name;
    if (els.trackATitle) els.trackATitle.textContent = state.name;
    refreshUi();
  }

  function refreshUi() {
    if (state.buffer) {
      const d = state.buffer.duration;
      clampSel();
      els.clipSub.textContent = `${fmt(d)} · ${state.buffer.numberOfChannels === 1 ? "mono" : "stereo"} · ${Math.round(state.buffer.sampleRate / 1000)} kHz`;
      els.timeStart.textContent = "0.0s";
      els.timeEnd.textContent = fmt(d);
      els.tStart.value = state.sel.start.toFixed(1);
      els.tEnd.value = state.sel.end.toFixed(1);
      els.selReadout.textContent = `${fmt(state.sel.start)} – ${fmt(state.sel.end)} selected · click to set the bar`;
      els.echoLabel.textContent = `${els.echoAmt.value}%`;
      if (els.selVolLabel) els.selVolLabel.textContent = `${els.selVol.value}%`;
      if (els.selPitchLabel) {
        const st = Number(els.selPitch.value);
        els.selPitchLabel.textContent = `${st > 0 ? "+" : ""}${st} st`;
      }
      if (els.selSpeedLabel) {
        els.selSpeedLabel.textContent = `${(Number(els.selSpeed.value) / 100).toFixed(2)}×`;
      }
      document.querySelectorAll(".speed-btn").forEach((btn) => {
        const v = Number(btn.dataset.speed);
        const cur = Number(els.selSpeed && els.selSpeed.value) / 100;
        btn.classList.toggle("active", Math.abs(v - cur) < 0.01);
      });
      if (els.vocalAmtLabel) els.vocalAmtLabel.textContent = `${els.vocalAmt.value}%`;
      if (els.noiseAmtLabel) els.noiseAmtLabel.textContent = `${els.noiseAmt.value}%`;
      updateApplyLabel();
      updateOverdubLabel();
    }
    drawWave();
    drawWaveB();
    if (els.selReadoutB && state.clipB) {
      els.timeStartB.textContent = "0.0s";
      els.timeEndB.textContent = fmt(state.clipB.duration);
      els.selReadoutB.textContent = `${fmt(state.selB.start)} – ${fmt(state.selB.end)} selected · click to set B’s bar`;
    }
    updatePlayheadReadout();
    drawLayerMap();
  }

  function updatePlayheadReadout() {
    if (!els.playheadReadout) return;
    const t = state.playing && state.playTrack === "a"
      ? state.playOffset + (audioCtx().currentTime - state.playStartedAt) * (state.playScale || 1)
      : state.playheadA;
    els.playheadReadout.textContent = `A bar ${fmt(t)}`;
  }

  function updateApplyLabel() {
    const a = state.sel.start.toFixed(1);
    const b = state.sel.end.toFixed(1);
    if (state.mode === "keep") {
      els.applyCutBtn.textContent = `Keep ${a}s – ${b}s  ·  delete the rest`;
      els.applyCutBtn.classList.remove("cut");
    } else {
      els.applyCutBtn.textContent = `Cut out ${a}s – ${b}s  ·  join the two remaining pieces`;
      els.applyCutBtn.classList.add("cut");
    }
  }

  function updateOverdubLabel() {
    if (!els.overdubBtn || state.overdubRec) return;
    const a = (state.sel.start || 0).toFixed(1);
    const b = (state.sel.end || 0).toFixed(1);
    els.overdubBtn.textContent = state.overdubMode === "instead"
      ? `Record instead of ${a}s – ${b}s`
      : `Record on top of ${a}s – ${b}s`;
    els.overdubBtn.classList.toggle("cut", state.overdubMode === "instead");
  }

  function copyRange(src, dst, dstOff, start, end) {
    dst.set(src.subarray(start, end), dstOff);
  }

  function sliceBuffer(buf, startSec, endSec) {
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const end = Math.min(buf.length, Math.floor(endSec * sr));
    const len = Math.max(1, end - start);
    const out = new AudioBuffer({
      length: len,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: sr,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c).subarray(start, end));
    }
    return out;
  }

  function cutOutBuffer(buf, startSec, endSec) {
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const end = Math.min(buf.length, Math.floor(endSec * sr));
    const keep = buf.length - (end - start);
    if (keep < 1) throw new Error("That would delete the whole clip.");
    const out = new AudioBuffer({
      length: keep,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: sr,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      copyRange(src, dst, 0, 0, start);
      copyRange(src, dst, start, end, buf.length);
    }
    return out;
  }

  async function matchRate(buf, rate) {
    if (buf.sampleRate === rate) return buf;
    const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * rate), rate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }

  function toStereo(buf) {
    if (buf.numberOfChannels >= 2) return buf;
    const out = new AudioBuffer({
      length: buf.length,
      numberOfChannels: 2,
      sampleRate: buf.sampleRate,
    });
    const m = buf.getChannelData(0);
    out.getChannelData(0).set(m);
    out.getChannelData(1).set(m);
    return out;
  }

  async function mixBuffers(a, b, volA, volB) {
    const rate = a.sampleRate;
    b = toStereo(await matchRate(b, rate));
    a = toStereo(a);
    const len = Math.max(a.length, b.length);
    const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: rate });
    for (let c = 0; c < 2; c++) {
      const da = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
      const db = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const va = i < da.length ? da[i] * volA : 0;
        const vb = i < db.length ? db[i] * volB : 0;
        dst[i] = Math.max(-1, Math.min(1, va + vb));
      }
    }
    return out;
  }

  async function applyEcho(buf, amount) {
    const wet = amount / 100;
    if (wet <= 0.01) return buf;
    const tail = 1.8;
    const ch = buf.numberOfChannels;
    const ctx = new OfflineAudioContext(ch, Math.ceil((buf.duration + tail) * buf.sampleRate), buf.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const dry = ctx.createGain();
    dry.gain.value = 1 - wet * 0.45;
    const wetGain = ctx.createGain();
    wetGain.gain.value = wet * 0.85;

    const delays = [0.16, 0.29, 0.43];
    const merger = ctx.createGain();
    delays.forEach((t, i) => {
      const delay = ctx.createDelay(1.2);
      delay.delayTime.value = t;
      const fb = ctx.createGain();
      fb.gain.value = 0.28 + wet * 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2800 - i * 400;
      const tap = ctx.createGain();
      tap.gain.value = 0.55 - i * 0.12;
      src.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(tap);
      tap.connect(merger);
    });

    src.connect(dry);
    dry.connect(ctx.destination);
    merger.connect(wetGain);
    wetGain.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }

  function getPeaks(width, buf = state.buffer) {
    if (!buf) return new Float32Array(width);
    const ch = buf.getChannelData(0);
    const extra = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const step = Math.max(1, Math.floor(ch.length / width));
    const stride = Math.max(8, Math.floor(step / 32));
    const peaks = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let max = 0;
      const start = x * step;
      const end = Math.min(ch.length, start + step);
      for (let i = start; i < end; i += stride) {
        const v = extra ? (Math.abs(ch[i]) + Math.abs(extra[i])) * 0.5 : Math.abs(ch[i]);
        if (v > max) max = v;
      }
      peaks[x] = max;
    }
    return peaks;
  }

  function rebuildWaveCache(cssW, cssH, dpr) {
    if (!state.buffer) {
      state.waveCache = null;
      return;
    }
    if (!state.peaks || state.peaks.length !== cssW) state.peaks = getPeaks(cssW);
    const oc = document.createElement("canvas");
    oc.width = Math.max(1, Math.floor(cssW * dpr));
    oc.height = Math.max(1, Math.floor(cssH * dpr));
    const g = oc.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0d0c0a";
    g.fillRect(0, 0, cssW, cssH);
    const mid = cssH / 2;
    g.beginPath();
    for (let x = 0; x < cssW; x++) {
      const h = state.peaks[x] * (cssH * 0.42);
      g.moveTo(x, mid - h);
      g.lineTo(x, mid + h);
    }
    g.strokeStyle = "#f4ead8";
    g.globalAlpha = 0.85;
    g.lineWidth = 1;
    g.stroke();
    state.waveCache = { canvas: oc, w: cssW, h: cssH, dpr };
  }

  function drawWave() {
    const canvas = els.wave;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 200;
    const pixelW = Math.max(1, Math.floor(cssW * dpr));
    const pixelH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      state.waveCache = null;
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!state.buffer) {
      g.fillStyle = "#0d0c0a";
      g.fillRect(0, 0, cssW, cssH);
      return;
    }

    if (!state.waveCache || state.waveCache.w !== cssW || state.waveCache.h !== cssH || state.waveCache.dpr !== dpr) {
      rebuildWaveCache(cssW, cssH, dpr);
    }
    if (state.waveCache) g.drawImage(state.waveCache.canvas, 0, 0, cssW, cssH);
    else {
      g.fillStyle = "#0d0c0a";
      g.fillRect(0, 0, cssW, cssH);
    }

    const dur = state.buffer.duration || 1;
    const xOf = (t) => (t / dur) * cssW;
    const selA = xOf(state.sel.start);
    const selB = xOf(state.sel.end);

    g.fillStyle = state.mode === "cut" ? "rgba(224, 122, 95, 0.22)" : "rgba(240, 180, 41, 0.22)";
    g.fillRect(selA, 0, Math.max(2, selB - selA), cssH);

    g.fillStyle = state.mode === "cut" ? "#e07a5f" : "#f0b429";
    g.fillRect(selA - 1.5, 8, 3, cssH - 16);
    g.fillRect(selB - 1.5, 8, 3, cssH - 16);

    if (state.segments && state.segments.length) {
      state.segments.forEach((seg) => {
        const x0 = xOf(seg.start);
        const x1 = xOf(seg.end);
        g.fillStyle = seg.kind === "voice" ? "rgba(240,180,41,0.85)" : seg.kind === "music" ? "rgba(143,191,122,0.85)" : "rgba(179,163,140,0.45)";
        g.fillRect(x0, cssH - 7, Math.max(1, x1 - x0), 5);
      });
    }

    const head = livePlayhead("a");
    drawPlayheadMark(g, xOf(head), cssH);
  }

  function drawPlayheadMark(g, x, cssH) {
    g.fillStyle = "#fff";
    g.fillRect(x - 1, 0, 2, cssH);
    g.beginPath();
    g.moveTo(x - 6, 0);
    g.lineTo(x + 6, 0);
    g.lineTo(x, 8);
    g.closePath();
    g.fill();
  }

  function livePlayhead(track) {
    if ((state.drag === "playhead" || state.drag === "maybe") && state.dragTrack === track) {
      return track === "b" ? state.playheadB : state.playheadA;
    }
    if (state.playing && state.playTrack === track) {
      return state.playOffset + (audioCtx().currentTime - state.playStartedAt) * (state.playScale || 1);
    }
    return track === "b" ? state.playheadB : state.playheadA;
  }

  function drawWaveB() {
    const canvas = els.waveB;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 400;
    const cssH = canvas.clientHeight || 72;
    const pixelW = Math.max(1, Math.floor(cssW * dpr));
    const pixelH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      state.waveCacheB = null;
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0d0c0a";
    g.fillRect(0, 0, cssW, cssH);
    if (!state.clipB) return;
    if (!state.peaksB || state.peaksB.length !== cssW) state.peaksB = getPeaks(cssW, state.clipB);
    if (!state.waveCacheB || state.waveCacheB.w !== cssW || state.waveCacheB.h !== cssH || state.waveCacheB.dpr !== dpr) {
      const oc = document.createElement("canvas");
      oc.width = pixelW;
      oc.height = pixelH;
      const og = oc.getContext("2d");
      og.setTransform(dpr, 0, 0, dpr, 0, 0);
      og.fillStyle = "#0d0c0a";
      og.fillRect(0, 0, cssW, cssH);
      const mid = cssH / 2;
      og.beginPath();
      for (let x = 0; x < cssW; x++) {
        const h = state.peaksB[x] * (cssH * 0.42);
        og.moveTo(x, mid - h);
        og.lineTo(x, mid + h);
      }
      og.strokeStyle = "#f4ead8";
      og.globalAlpha = 0.85;
      og.stroke();
      state.waveCacheB = { canvas: oc, w: cssW, h: cssH, dpr };
    }
    g.drawImage(state.waveCacheB.canvas, 0, 0, cssW, cssH);
    const dur = state.clipB.duration || 1;
    const xOf = (t) => (t / dur) * cssW;
    const selA = xOf(state.selB.start);
    const selB = xOf(state.selB.end);
    g.fillStyle = "rgba(240, 180, 41, 0.22)";
    g.fillRect(selA, 0, Math.max(2, selB - selA), cssH);
    g.fillStyle = "#f0b429";
    g.fillRect(selA - 1.5, 6, 3, cssH - 12);
    g.fillRect(selB - 1.5, 6, 3, cssH - 12);
    drawPlayheadMark(g, xOf(livePlayhead("b")), cssH);
  }

  function xToTimeOn(canvas, buf, clientX) {
    const rect = canvas.getBoundingClientRect();
    const p = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(buf.duration, p * buf.duration));
  }

  function xToTime(clientX) {
    const rect = els.wave.getBoundingClientRect();
    const p = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(state.buffer.duration, p * state.buffer.duration));
  }

  function stopPlayback(opts = {}) {
    state.playGen = (state.playGen || 0) + 1;
    if (state.playing && !opts.keepHead) {
      const t = state.playOffset + (audioCtx().currentTime - state.playStartedAt) * (state.playScale || 1);
      if (state.playTrack === "b" && state.clipB) {
        state.playheadB = Math.max(0, Math.min(state.clipB.duration, t));
      } else if (state.buffer) {
        state.playheadA = Math.max(0, Math.min(state.buffer.duration, t));
      }
    }
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    state.sources.forEach((s) => {
      try {
        s.onended = null;
        s.stop();
      } catch (_) {}
    });
    state.sources = [];
    state.playing = false;
    state.playMix = false;
    state.playScale = 1;
    state.playUntil = null;
    state.liveGain = null;
    els.playBtn.textContent = "Play from bar";
    if (els.playBBtn) els.playBBtn.textContent = "Play B";
    if (els.playMixBtn) els.playMixBtn.textContent = "Play both";
    updatePlayheadReadout();
  }

  function connectEcho(ctx, node) {
    const wet = Number(els.echoAmt.value) / 100;
    const dry = ctx.createGain();
    dry.gain.value = 1;
    node.connect(dry);
    dry.connect(ctx.destination);
    if (wet < 0.02) return;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.22;
    const fb = ctx.createGain();
    fb.gain.value = 0.25 + wet * 0.35;
    const mix = ctx.createGain();
    mix.gain.value = wet * 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    node.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(mix);
    mix.connect(ctx.destination);
  }

  function currentTune() {
    return {
      gain: els.selVol ? Number(els.selVol.value) / 100 : 1,
      st: els.selPitch ? Number(els.selPitch.value) : 0,
      speed: els.selSpeed ? Number(els.selSpeed.value) / 100 : 1,
    };
  }

  function needsTuneProcess() {
    const { st, speed } = currentTune();
    return Math.abs(st) >= 0.01 || Math.abs(speed - 1) >= 0.01;
  }

  function playBuffer(buf, offset, until, { mixLayer = false, headAt = offset, playScale = 1, gain = null, echo = true } = {}) {
    stopPlayback();
    const gen = state.playGen;
    const ctx = audioCtx();
    const dur = Math.max(0.05, until - offset);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g1 = ctx.createGain();
    if (mixLayer) g1.gain.value = Number(els.volMain.value) / 100;
    else if (gain != null) g1.gain.value = gain;
    else g1.gain.value = els.selVol ? Number(els.selVol.value) / 100 : 1;
    src.connect(g1);
    if (echo) connectEcho(ctx, g1);
    else g1.connect(ctx.destination);
    src.start(0, offset, dur);
    src.onended = () => {
      if (gen !== state.playGen || !state.playing) return;
      if (state.playTrack === "b" && state.clipB) state.playheadB = state.playUntil || state.clipB.duration;
      else if (state.buffer) state.playheadA = state.playUntil || state.buffer.duration;
      stopPlayback();
      drawWave();
      drawWaveB();
    };
    state.sources.push(src);

    if (mixLayer && state.layer) {
      const src2 = ctx.createBufferSource();
      src2.buffer = state.layer;
      const g2 = ctx.createGain();
      g2.gain.value = Number(els.volLayer.value) / 100;
      src2.connect(g2);
      connectEcho(ctx, g2);
      const layerOff = Math.min(offset, Math.max(0, state.layer.duration - 0.05));
      src2.start(0, layerOff, Math.min(dur, state.layer.duration - layerOff));
      state.sources.push(src2);
    }

    state.playing = true;
    state.playOffset = headAt;
    state.playScale = playScale;
    state.playUntil = headAt + dur * playScale;
    state.playStartedAt = ctx.currentTime;
    state.liveGain = mixLayer || gain != null ? null : g1;
    els.playBtn.textContent = state.playTrack === "b" ? "Play from bar" : "Stop";
    if (els.playBBtn) els.playBBtn.textContent = state.playTrack === "b" ? "Stop B" : "Play B";
    tick();
  }

  async function playFromBar(track) {
    const isB = track === "b";
    const buf = isB ? state.clipB : state.buffer;
    if (!buf) {
      toast(isB ? "Load Clip B first." : "Load a recording first.");
      return;
    }
    if (state.playing) {
      const was = state.playTrack;
      stopPlayback();
      if (was === (isB ? "b" : "a")) {
        drawWave();
        drawWaveB();
        return;
      }
    }
    let from = isB ? state.playheadB : state.playheadA;
    if (from >= buf.duration - 0.05) from = 0;
    state.playTrack = isB ? "b" : "a";
    playBuffer(buf, from, buf.duration, isB ? { gain: 1, echo: false } : {});
  }

  async function playSelOf(track) {
    const isB = track === "b";
    const buf = isB ? state.clipB : state.buffer;
    const sel = isB ? state.selB : state.sel;
    if (!buf) return;
    if (isB) clampSelB();
    else clampSel();
    state.playTrack = isB ? "b" : "a";
    if (isB) state.playheadB = sel.start;
    else state.playheadA = sel.start;
    if (!isB && needsTuneProcess()) {
      const { st, speed } = currentTune();
      toast("Hearing pitch / speed on the selection…");
      await nextPaint();
      try {
        const tuned = await tuneSlice(sliceBuffer(buf, sel.start, sel.end), { st, speed });
        playBuffer(tuned, 0, tuned.duration, { headAt: sel.start, playScale: speed });
      } catch (err) {
        console.error(err);
        toast("Could not preview pitch / speed.");
        playBuffer(buf, sel.start, sel.end);
      }
      return;
    }
    playBuffer(buf, sel.start, sel.end, isB ? { gain: 1, echo: false } : {});
  }

  function skipBar(seconds, track = "a") {
    const isB = track === "b" && state.clipB;
    const buf = isB ? state.clipB : state.buffer;
    if (!buf) return;
    const which = isB ? "b" : "a";
    const resume = state.playing && state.playTrack === which;
    if (resume) stopPlayback();
    if (isB) {
      state.playheadB = Math.max(0, Math.min(buf.duration, state.playheadB + seconds));
    } else {
      state.playheadA = Math.max(0, Math.min(buf.duration, state.playheadA + seconds));
    }
    updatePlayheadReadout();
    drawWave();
    drawWaveB();
    const head = isB ? state.playheadB : state.playheadA;
    if (resume && head < buf.duration - 0.05) playFromBar(which);
  }

  function tick() {
    if (state.overdubRec && state.overdubRec.state === "inactive") state.overdubRec = null;
    if (!state.playing) {
      drawWave();
      state.raf = 0;
      return;
    }
    const t = state.playOffset + (audioCtx().currentTime - state.playStartedAt) * (state.playScale || 1);
    const host = state.playTrack === "b" ? state.clipB : state.buffer;
    const limit = state.playUntil || (host ? host.duration : t);
    if (state.playTrack === "b") state.playheadB = t;
    else state.playheadA = t;
    updatePlayheadReadout();
    if (t >= limit + 0.05 && !state.overdubRec) {
      stopPlayback();
      drawWave();
      drawWaveB();
      return;
    }
    drawWave();
    if (state.playTrack === "b") drawWaveB();
    updatePlayheadReadout();
    state.raf = requestAnimationFrame(tick);
  }

  async function saveDownload(kind) {
    if (!state.buffer) return;
    const run = async () => {
      if (!window.ClipCutBilling || !window.ClipCutBilling.authorizeDownload) {
        toast("Payment screen failed to load. Press Ctrl+F5 and try Download again.");
        return false;
      }
      const ok = await window.ClipCutBilling.authorizeDownload();
      if (!ok) return false;
      const btn = kind === "mp3" ? els.downloadMp3Btn : kind === "mp4" ? els.downloadMp4Btn : els.downloadWavBtn;
      if (btn) btn.disabled = true;
      if (kind === "mp3") toast("Encoding MP3…");
      else if (kind === "mp4") toast("Encoding MP4…");
      await nextPaint();
      try {
        let blob;
        let filename;
        let doneMsg;
        if (kind === "mp3") {
          blob = await encodeMp3(state.buffer);
          filename = `${safeName()}.mp3`;
          doneMsg = "Downloading MP3.";
        } else if (kind === "mp4") {
          blob = await encodeMp4(state.buffer);
          filename = `${safeName()}.mp4`;
          doneMsg = "Downloading MP4.";
        } else {
          blob = new Blob([encodeWav(state.buffer)], { type: "audio/wav" });
          filename = `${safeName()}.wav`;
          doneMsg = "Downloading WAV.";
        }
        clickDownload(blob, filename);
        toast(doneMsg);
        return true;
      } catch (err) {
        console.error(err);
        toast(err.message || "Could not build that file.");
        return false;
      } finally {
        if (btn) btn.disabled = false;
      }
    };
    if (window.ClipCutBilling) window.ClipCutBilling.queueDownload(run);
    const ok = await run();
    if (ok && window.ClipCutBilling) window.ClipCutBilling.queueDownload(null);
  }

  function clickDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadWav(buf, filename) {
    clickDownload(new Blob([encodeWav(buf)], { type: "audio/wav" }), filename);
  }

  function encodeWav(buf) {
    const ch = buf.numberOfChannels;
    const sr = buf.sampleRate;
    const len = buf.length;
    const dataLen = len * ch * 2;
    const out = new ArrayBuffer(44 + dataLen);
    const view = new DataView(out);
    const writeStr = (o, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataLen, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, ch, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * ch * 2, true);
    view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataLen, true);
    const channels = [];
    for (let c = 0; c < ch; c++) channels.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        let s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    return out;
  }

  function floatTo16(src) {
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const s = Math.max(-1, Math.min(1, src[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load encoder"));
      document.head.appendChild(s);
    });
  }

  async function ensureLame() {
    if (window.lamejs && window.lamejs.Mp3Encoder) return window.lamejs;
    await loadScript("https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js");
    if (!window.MPEGMode) {
      window.MPEGMode = { STEREO: 0, JOINT_STEREO: 1, DUAL_CHANNEL: 2, MONO: 3 };
    }
    if (!window.lamejs) throw new Error("MP3 encoder failed to load.");
    return window.lamejs;
  }

  async function encodeMp3(buf) {
    const lame = await ensureLame();
    buf = await matchRate(toStereo(buf), 44100);
    const left = floatTo16(buf.getChannelData(0));
    const right = floatTo16(buf.getChannelData(1));
    const encoder = new lame.Mp3Encoder(2, 44100, 128);
    const block = 1152;
    const parts = [];
    for (let i = 0; i < left.length; i += block) {
      const l = left.subarray(i, Math.min(i + block, left.length));
      const r = right.subarray(i, Math.min(i + block, right.length));
      const chunk = encoder.encodeBuffer(l, r);
      if (chunk && chunk.length) parts.push(new Uint8Array(chunk));
    }
    const end = encoder.flush();
    if (end && end.length) parts.push(new Uint8Array(end));
    if (!parts.length) throw new Error("MP3 encoding produced an empty file.");
    return new Blob(parts, { type: "audio/mpeg" });
  }

  async function encodeMp4(buf) {
    buf = await matchRate(toStereo(buf), 44100);
    if (typeof AudioEncoder === "function" && typeof AudioData === "function") {
      try {
        return await encodeMp4WebCodecs(buf);
      } catch (err) {
        console.warn("WebCodecs MP4 failed, trying MediaRecorder", err);
      }
    }
    const recBlob = await encodeMp4MediaRecorder(buf);
    if (recBlob) return recBlob;
    return encodeMp4Pcm(buf);
  }

  async function encodeMp4WebCodecs(buf) {
    const { Muxer, ArrayBufferTarget } = await import("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs");
    const ch = 2;
    const sr = buf.sampleRate;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      fastStart: "in-memory",
      audio: { codec: "aac", sampleRate: sr, numberOfChannels: ch },
    });
    let encoderError = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    encoder.configure({
      codec: "mp4a.40.2",
      sampleRate: sr,
      numberOfChannels: ch,
      bitrate: 192000,
    });
    const frame = 1024;
    for (let i = 0; i < buf.length; i += frame) {
      const n = Math.min(frame, buf.length - i);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) {
        data.set(buf.getChannelData(c).subarray(i, i + n), c * n);
      }
      const audio = new AudioData({
        format: "f32-planar",
        sampleRate: sr,
        numberOfFrames: n,
        numberOfChannels: ch,
        timestamp: Math.round((i / sr) * 1e6),
        data,
      });
      encoder.encode(audio);
      audio.close();
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();
    return new Blob([target.buffer], { type: "audio/mp4" });
  }

  function pickMime(types) {
    if (typeof MediaRecorder === "undefined") return "";
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  }

  async function encodeMp4MediaRecorder(buf) {
    const mime = pickMime([
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
    ]);
    if (!mime) return null;
    const ctx = audioCtx();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
      rec.onerror = () => reject(new Error("MP4 recorder failed"));
    });
    rec.start();
    src.start();
    await new Promise((resolve) => {
      src.onended = resolve;
      setTimeout(resolve, buf.duration * 1000 + 400);
    });
    if (rec.state !== "inactive") rec.stop();
    const blob = await done;
    return blob.size > 100 ? blob : null;
  }

  function concatBytes(parts) {
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  function u32b(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n);
    return b;
  }

  function fourcc(s) {
    return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);
  }

  function box(type, payload) {
    return concatBytes([u32b(8 + payload.length), fourcc(type), payload]);
  }

  function encodeMp4Pcm(buf) {
    const ch = buf.numberOfChannels;
    const sr = buf.sampleRate;
    const pcm = new Uint8Array(encodeWav(buf).slice(44));
    const ftyp = box("ftyp", concatBytes([
      fourcc("isom"),
      u32b(0),
      fourcc("isom"),
      fourcc("mp41"),
    ]));
    const mdat = box("mdat", pcm);
    const stsd = box("stsd", concatBytes([
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      box("sowt", concatBytes([
        new Uint8Array(6),
        new Uint8Array([0, 1]),
        new Uint8Array(8),
        u32b((ch << 16) | 16),
        new Uint8Array(4),
        u32b(sr << 16),
      ])),
    ]));
    const stts = box("stts", concatBytes([new Uint8Array(4), u32b(1), u32b(1), u32b(buf.length)]));
    const stsc = box("stsc", concatBytes([new Uint8Array(4), u32b(1), u32b(1), u32b(1), u32b(1)]));
    const stsz = box("stsz", concatBytes([new Uint8Array(4), u32b(ch * 2), u32b(buf.length)]));
    const stco = box("stco", concatBytes([new Uint8Array(4), u32b(1), u32b(ftyp.length + 8)]));
    const stbl = box("stbl", concatBytes([stsd, stts, stsc, stsz, stco]));
    const dinf = box("dinf", box("dref", concatBytes([
      new Uint8Array(4),
      u32b(1),
      box("url ", new Uint8Array([0, 0, 0, 1])),
    ])));
    const minf = box("minf", concatBytes([
      box("smhd", new Uint8Array(8)),
      dinf,
      stbl,
    ]));
    const mdia = box("mdia", concatBytes([
      box("mdhd", concatBytes([
        new Uint8Array(4),
        u32b(0), u32b(0),
        u32b(sr),
        u32b(buf.length),
        new Uint8Array([0x55, 0xc4, 0, 0]),
      ])),
      box("hdlr", concatBytes([
        new Uint8Array(8),
        fourcc("soun"),
        new Uint8Array(12),
        new Uint8Array([0]),
      ])),
      minf,
    ]));
    const trak = box("trak", concatBytes([
      box("tkhd", concatBytes([
        new Uint8Array([0, 0, 0, 7]),
        u32b(0), u32b(0),
        u32b(1),
        new Uint8Array(4),
        u32b(Math.round(buf.duration * 1000)),
        new Uint8Array(8),
        new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]),
        new Uint8Array(36),
        u32b(0), u32b(0),
      ])),
      mdia,
    ]));
    const moov = box("moov", concatBytes([
      box("mvhd", concatBytes([
        new Uint8Array(4),
        u32b(0), u32b(0),
        u32b(1000),
        u32b(Math.round(buf.duration * 1000)),
        new Uint8Array([0, 1, 0, 0]),
        new Uint8Array([1, 0]),
        new Uint8Array(10),
        new Uint8Array(36),
        new Uint8Array(24),
        u32b(2),
      ])),
      trak,
    ]));
    return new Blob([concatBytes([ftyp, mdat, moov])], { type: "audio/mp4" });
  }

  function matchChannels(buf, channels) {
    if (buf.numberOfChannels === channels) return buf;
    const out = new AudioBuffer({ length: buf.length, numberOfChannels: channels, sampleRate: buf.sampleRate });
    for (let c = 0; c < channels; c++) {
      out.getChannelData(c).set(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
    }
    return out;
  }

  async function fitToClip(insert, host) {
    insert = await matchRate(insert, host.sampleRate);
    return matchChannels(insert, host.numberOfChannels);
  }

  function exactLength(buf, targetLen) {
    const len = Math.max(1, targetLen);
    if (buf.length === len) return buf;
    const out = new AudioBuffer({
      length: len,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: buf.sampleRate,
    });
    const copy = Math.min(buf.length, len);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c).subarray(0, copy));
    }
    return out;
  }

  async function fitDuration(buf, targetSec) {
    const targetLen = Math.max(1, Math.round(targetSec * buf.sampleRate));
    if (Math.abs(buf.length - targetLen) < 24) return exactLength(buf, targetLen);
    const speed = buf.length / targetLen;
    const out = await changeSpeed(buf, speed);
    return exactLength(out, targetLen);
  }

  function replaceRange(buf, startSec, endSec, insert) {
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const end = Math.min(buf.length, Math.floor(endSec * sr));
    const len = start + insert.length + (buf.length - end);
    const out = new AudioBuffer({ length: Math.max(1, len), numberOfChannels: buf.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      const ic = insert.getChannelData(Math.min(c, insert.numberOfChannels - 1));
      dst.set(src.subarray(0, start), 0);
      dst.set(ic, start);
      dst.set(src.subarray(end), start + ic.length);
      const fade = Math.min(Math.floor(0.006 * sr), ic.length >> 1);
      if (fade > 1) {
        for (let i = 0; i < fade; i++) {
          const w = i / fade;
          dst[start + i] *= w;
          dst[start + ic.length - fade + i] *= 1 - w;
        }
      }
    }
    return out;
  }

  function mixOnto(buf, startSec, insert, insertVol = 1) {
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const needed = start + insert.length;
    const len = Math.max(buf.length, needed);
    const out = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      const ic = insert.getChannelData(Math.min(c, insert.numberOfChannels - 1));
      dst.set(src);
      for (let i = 0; i < ic.length; i++) {
        dst[start + i] = Math.max(-1, Math.min(1, (dst[start + i] || 0) + ic[i] * insertVol));
      }
    }
    return out;
  }

  const LAYER_ARROW_COLS = ["#f0b429", "#e07a5f", "#8fbf7a", "#7eb6ff"];

  function clampPair(sel, dur) {
    if (!sel || !dur) return;
    let a = Math.max(0, Math.min(sel.start, dur));
    let b = Math.max(0, Math.min(sel.end, dur));
    if (b < a) { const t = a; a = b; b = t; }
    if (b - a < 0.05) b = Math.min(dur, a + 0.05);
    sel.start = a;
    sel.end = b;
  }

  function resetLayerNav() {
    state.layerMaps = [];
    state.layerMapSeq = 1;
    state.layerMapDrag = null;
    const layerDur = state.layer ? state.layer.duration : 0;
    const mainDur = state.buffer ? state.buffer.duration : 0;
    state.layerSel = { start: 0, end: layerDur ? Math.min(2, layerDur) : 0 };
    state.layerDestSel = { start: 0, end: mainDur ? Math.min(2, mainDur) : 0 };
    clampPair(state.layerSel, layerDur);
    clampPair(state.layerDestSel, mainDur);
    renderLayerMapList();
    requestAnimationFrame(() => drawLayerMap());
  }

  function paintMiniWave(canvas, buf, liveSel, side) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 40;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    g.fillStyle = "#0d0c0a";
    g.fillRect(0, 0, cssW, cssH);
    if (!buf) return;
    const peaks = getPeaks(Math.max(1, Math.floor(cssW)), buf);
    const mid = cssH / 2;
    g.strokeStyle = "#c4b59a";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < cssW; x++) {
      const amp = peaks[x] * (cssH * 0.38);
      g.moveTo(x, mid - amp);
      g.lineTo(x, mid + amp);
    }
    g.stroke();
    const dur = buf.duration || 1;
    const xOf = (t) => (t / dur) * cssW;
    state.layerMaps.forEach((m, i) => {
      const range = side === "main" ? m.dest : m.src;
      const col = LAYER_ARROW_COLS[i % LAYER_ARROW_COLS.length];
      g.fillStyle = col === "#f0b429" ? "rgba(240,180,41,0.22)"
        : col === "#e07a5f" ? "rgba(224,122,95,0.22)"
        : col === "#8fbf7a" ? "rgba(143,191,122,0.22)"
        : "rgba(126,182,255,0.22)";
      g.fillRect(xOf(range.start), 0, Math.max(2, xOf(range.end) - xOf(range.start)), cssH);
    });
    if (liveSel && liveSel.end > liveSel.start) {
      g.fillStyle = "rgba(240,180,41,0.32)";
      g.fillRect(xOf(liveSel.start), 0, Math.max(2, xOf(liveSel.end) - xOf(liveSel.start)), cssH);
      g.fillStyle = "#f0b429";
      g.fillRect(xOf(liveSel.start) - 1, 0, 2, cssH);
      g.fillRect(xOf(liveSel.end) - 1, 0, 2, cssH);
    }
  }

  function drawLayerArrows() {
    const svg = els.layerMapArrows;
    const stage = els.layerMapStage;
    const main = els.layerMapMain;
    const layer = els.layerMapLayer;
    if (!svg || !stage || !main || !layer) return;
    const sr = stage.getBoundingClientRect();
    const mr = main.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    const w = Math.max(1, sr.width);
    const h = Math.max(1, sr.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    const xOn = (rect, buf, t) => {
      if (!buf || !buf.duration) return rect.left - sr.left;
      return rect.left - sr.left + (t / buf.duration) * rect.width;
    };
    const bits = state.layerMaps.map((m, i) => {
      const col = LAYER_ARROW_COLS[i % LAYER_ARROW_COLS.length];
      const x1 = xOn(lr, state.layer, (m.src.start + m.src.end) / 2);
      const x2 = xOn(mr, state.buffer, (m.dest.start + m.dest.end) / 2);
      const y1 = lr.top - sr.top + 2;
      const y2 = mr.top - sr.top + mr.height - 2;
      const midY = (y1 + y2) / 2;
      return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="1.6"/>
        <polygon points="${x2},${y2} ${x2 - 4},${y2 + 7} ${x2 + 4},${y2 + 7}" fill="${col}"/>`;
    });
    svg.innerHTML = bits.join("");
  }

  function drawLayerMap() {
    if (!els.layerMapMain) return;
    if (!state.layer) {
      if (els.layerMapArrows) els.layerMapArrows.innerHTML = "";
      return;
    }
    paintMiniWave(els.layerMapMain, state.buffer, state.layerDestSel, "main");
    paintMiniWave(els.layerMapLayer, state.layer, state.layerSel, "layer");
    drawLayerArrows();
    if (els.layerMapHint) {
      els.layerMapHint.textContent = state.layerMaps.length
        ? `${state.layerMaps.length} arrow${state.layerMaps.length === 1 ? "" : "s"} · Merge places them on the main clip`
        : "Drag a piece on Layer, drag where it lands on Main, then Add arrow.";
    }
  }

  function renderLayerMapList() {
    if (!els.layerMapList) return;
    if (!state.layerMaps.length) {
      els.layerMapList.innerHTML = "";
      return;
    }
    els.layerMapList.innerHTML = state.layerMaps.map((m, i) => {
      const col = LAYER_ARROW_COLS[i % LAYER_ARROW_COLS.length];
      return `<div class="layer-map-item" data-mapid="${m.id}">
        <i class="layer-map-dot" style="background:${col}"></i>
        <span>L ${m.src.start.toFixed(1)}–${m.src.end.toFixed(1)} → M ${m.dest.start.toFixed(1)}–${m.dest.end.toFixed(1)}</span>
        <select data-mapmode="${m.id}">
          <option value="ontop"${m.mode === "ontop" ? " selected" : ""}>On top</option>
          <option value="instead"${m.mode === "instead" ? " selected" : ""}>Instead</option>
          <option value="ontop-fixed"${m.mode === "ontop-fixed" ? " selected" : ""}>On top fixed</option>
        </select>
        <button type="button" class="text-btn" data-mapdel="${m.id}">Remove</button>
      </div>`;
    }).join("");
  }

  function addLayerArrow() {
    if (!state.buffer || !state.layer) return;
    clampPair(state.layerSel, state.layer.duration);
    clampPair(state.layerDestSel, state.buffer.duration);
    if (state.layerSel.end - state.layerSel.start < 0.05 || state.layerDestSel.end - state.layerDestSel.start < 0.05) {
      toast("Mark a range on Layer and on Main first.");
      return;
    }
    state.layerMaps.push({
      id: state.layerMapSeq++,
      src: { start: state.layerSel.start, end: state.layerSel.end },
      dest: { start: state.layerDestSel.start, end: state.layerDestSel.end },
      mode: state.layerMapMode || "ontop",
    });
    renderLayerMapList();
    drawLayerMap();
    toast("Arrow added. Add more, or Merge.");
  }

  async function applyLayerMaps() {
    if (!state.buffer || !state.layer || !state.layerMaps.length) return null;
    const vol = Number(els.volLayer.value) / 100;
    let host = state.buffer;
    const maps = state.layerMaps.slice().sort((a, b) => b.dest.start - a.dest.start);
    for (const m of maps) {
      const srcA = Math.max(0, Math.min(m.src.start, state.layer.duration));
      const srcB = Math.max(srcA + 0.05, Math.min(m.src.end, state.layer.duration));
      const destA = Math.max(0, Math.min(m.dest.start, host.duration));
      const destB = Math.max(destA + 0.05, Math.min(m.dest.end, host.duration));
      let take = sliceBuffer(state.layer, srcA, srcB);
      take = await fitToClip(take, host);
      take = applyGainBuffer(take, vol);
      if (m.mode === "instead") {
        host = replaceRange(host, destA, destB, take);
      } else if (m.mode === "ontop-fixed") {
        take = await fitDuration(take, destB - destA);
        host = mixOnto(host, destA, take, 1);
      } else {
        const maxLen = host.length - Math.max(0, Math.floor(destA * host.sampleRate));
        if (take.length > maxLen) take = exactLength(take, Math.max(1, maxLen));
        host = mixOnto(host, destA, take, 1);
      }
    }
    return host;
  }

  function bindLayerMini(canvas, which) {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", (e) => {
      const buf = which === "main" ? state.buffer : state.layer;
      const sel = which === "main" ? state.layerDestSel : state.layerSel;
      if (!buf) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const t = xToTimeOn(canvas, buf, e.clientX);
      state.layerMapDrag = { which, startX: e.clientX, startT: t, mode: "maybe" };
      sel.start = t;
      sel.end = Math.min(buf.duration, t + 0.05);
      drawLayerMap();
    });
    canvas.addEventListener("pointermove", (e) => {
      const drag = state.layerMapDrag;
      if (!drag || drag.which !== which) return;
      const buf = which === "main" ? state.buffer : state.layer;
      const sel = which === "main" ? state.layerDestSel : state.layerSel;
      if (!buf) return;
      const t = xToTimeOn(canvas, buf, e.clientX);
      if (drag.mode === "maybe") {
        if (Math.abs(e.clientX - drag.startX) < 6) return;
        drag.mode = "sel";
      }
      sel.start = drag.startT;
      sel.end = t;
      clampPair(sel, buf.duration);
      drawLayerMap();
    });
    const end = () => {
      if (!state.layerMapDrag || state.layerMapDrag.which !== which) return;
      const buf = which === "main" ? state.buffer : state.layer;
      const sel = which === "main" ? state.layerDestSel : state.layerSel;
      if (buf) clampPair(sel, buf.duration);
      state.layerMapDrag = null;
      drawLayerMap();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  function clampSelB() {
    if (!state.clipB) return;
    const d = state.clipB.duration;
    let a = Math.max(0, Math.min(state.selB.start, d));
    let b = Math.max(0, Math.min(state.selB.end, d));
    if (b - a < 0.05) b = Math.min(d, a + 0.05);
    state.selB.start = a;
    state.selB.end = b;
  }

  function setClipB(buffer, name, selectRange) {
    state.clipB = buffer;
    if (name) state.nameB = name;
    state.peaksB = null;
    state.waveCacheB = null;
    state.selB = selectRange || { start: 0, end: buffer.duration };
    state.playheadB = state.selB.start;
    if (els.trackBTitle) els.trackBTitle.textContent = state.nameB || "Clip B";
    clampSelB();
    refreshUi();
  }

  function setActiveTrack(which) {
    state.dragTrack = which;
    if (els.trackA) els.trackA.classList.toggle("active", which === "a");
    if (els.trackB) els.trackB.classList.toggle("active", which === "b");
    updatePlayheadReadout();
  }

  function copyFrom(track) {
    const isB = track === "b";
    const buf = isB ? state.clipB : state.buffer;
    const sel = isB ? state.selB : state.sel;
    if (!buf) {
      toast(isB ? "Load Clip B first." : "Load a recording first.");
      return false;
    }
    if (isB) clampSelB();
    else clampSel();
    const piece = sliceBuffer(buf, sel.start, sel.end);
    if (!piece || piece.duration < 0.04) {
      toast("Select a longer piece to copy.");
      return false;
    }
    const from = isB ? (state.nameB || "B") : (state.name || "A");
    state.clipboard = {
      buffer: piece,
      name: `${from} ${fmt(sel.start)}–${fmt(sel.end)}`,
    };
    setActiveTrack(track);
    toast("Copied. Paste on top, on top fixed, or instead.");
    return true;
  }

  function cutFrom(track) {
    const isB = track === "b";
    const buf = isB ? state.clipB : state.buffer;
    const sel = isB ? { ...state.selB } : { ...state.sel };
    if (!copyFrom(track)) return;
    try {
      const next = cutOutBuffer(buf, sel.start, sel.end);
      if (isB) setClipB(next, state.nameB, { start: sel.start, end: Math.min(sel.start + 0.05, next.duration) });
      else setClip(next, state.name);
      toast("Cut. Paste it on top or instead on A or B.");
    } catch (err) {
      toast(err.message || "Could not cut.");
    }
  }

  async function pasteInto(track, mode) {
    if (!state.clipboard) {
      toast("Copy or cut a selection first.");
      return;
    }
    const dest = track === "b" ? "b" : "a";
    state.pasteMode = mode;
    if (dest === "b" && !state.clipB) {
      if (mode === "ontop-fixed") {
        toast("Load Clip B and select the drop spot first.");
        return;
      }
      setClipB(state.clipboard.buffer, state.clipboard.name);
      setActiveTrack("b");
      toast("Pasted into Clip B.");
      return;
    }
    const host = dest === "b" ? state.clipB : state.buffer;
    const sel = dest === "b" ? state.selB : state.sel;
    if (!host) {
      toast("Load Clip A first.");
      return;
    }
    if (dest === "b") clampSelB();
    else clampSel();
    try {
      const take = await fitToClip(state.clipboard.buffer, host);
      if (mode === "instead") {
        const next = replaceRange(host, sel.start, sel.end, take);
        const range = { start: sel.start, end: sel.start + take.duration };
        if (dest === "b") setClipB(next, state.nameB, range);
        else setClip(next, state.name, { selectRange: range });
        toast("Pasted instead of that selection.");
      } else if (mode === "ontop-fixed") {
        const hole = Math.max(0.05, sel.end - sel.start);
        toast("Fitting into the selection…");
        await nextPaint();
        const fitted = await fitDuration(take, hole);
        const next = mixOnto(host, sel.start, fitted, 1);
        const range = { start: sel.start, end: sel.end };
        if (dest === "b") setClipB(next, state.nameB, range);
        else setClip(next, state.name, { selectRange: range });
        toast("Pasted on top, fitted to that selection.");
      } else {
        const next = mixOnto(host, sel.start, take, 1);
        const range = { start: sel.start, end: sel.start + take.duration };
        if (dest === "b") setClipB(next, state.nameB, range);
        else setClip(next, state.name, { selectRange: range });
        toast("Pasted on top of that selection.");
      }
      setActiveTrack(dest);
    } catch (err) {
      console.error(err);
      toast("Could not paste.");
    }
  }

  function applyGainBuffer(buf, gain) {
    if (Math.abs(gain - 1) < 0.01) return buf;
    const out = cloneBuffer(buf);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * gain));
    }
    return out;
  }

  function applyGainRange(buf, startSec, endSec, gain) {
    const slice = applyGainBuffer(sliceBuffer(buf, startSec, endSec), gain);
    return replaceRange(buf, startSec, endSec, slice);
  }

  async function resamplePlayback(buf, rate) {
    if (Math.abs(rate - 1) < 0.001) return buf;
    const dur = buf.duration / rate;
    const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.ceil(dur * buf.sampleRate)), buf.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }

  function solaShift(src, dest, inPos, outPos, overlap, search) {
    const n = Math.min(overlap, dest.length - outPos, src.length - inPos + search);
    if (n < 24 || search < 2) return 0;
    let bestOff = 0;
    let best = Infinity;
    const maxOff = Math.min(search, inPos, Math.max(0, src.length - inPos - 24));
    for (let off = -maxOff; off <= maxOff; off += 2) {
      const s0 = inPos + off;
      if (s0 < 0 || s0 + n > src.length) continue;
      let err = 0;
      for (let i = 0; i < n; i += 2) err += Math.abs(dest[outPos + i] - src[s0 + i]);
      if (err < best) {
        best = err;
        bestOff = off;
      }
    }
    return bestOff;
  }

  async function changeSpeed(buf, speed) {
    if (Math.abs(speed - 1) < 0.01) return buf;
    const sr = buf.sampleRate;
    const grain = Math.max(256, Math.round(sr * 0.032));
    const hopOut = Math.max(64, Math.round(grain * 0.25));
    const hopIn = Math.max(32, Math.round(hopOut * speed));
    const search = Math.min(Math.round(sr * 0.006), hopOut);
    const keep = Math.max(1, Math.round(buf.length / speed));
    const win = new Float32Array(grain);
    for (let i = 0; i < grain; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, grain - 1));
    const outLen = keep + grain;
    const out = new AudioBuffer({
      length: outLen,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: sr,
    });
    const srcs = [];
    const dsts = [];
    for (let c = 0; c < buf.numberOfChannels; c++) {
      srcs.push(buf.getChannelData(c));
      dsts.push(out.getChannelData(c));
    }
    const weights = new Float32Array(outLen);
    let inPos = 0;
    let outPos = 0;
    let hops = 0;
    while (outPos < keep && inPos < buf.length) {
      const shift = outPos === 0 ? 0 : solaShift(srcs[0], dsts[0], inPos, outPos, hopOut, search);
      const srcPos = Math.max(0, Math.min(buf.length - 1, inPos + shift));
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const src = srcs[c];
        const dst = dsts[c];
        for (let i = 0; i < grain; i++) {
          const o = outPos + i;
          if (o >= dst.length) break;
          const s = srcPos + i;
          const v = (s < src.length ? src[s] : 0) * win[i];
          dst[o] += v;
          if (c === 0) weights[o] += win[i];
        }
      }
      inPos += hopIn;
      outPos += hopOut;
      if (++hops % 180 === 0) await nextPaint();
    }
    const clipped = new AudioBuffer({
      length: keep,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: sr,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = dsts[c];
      const dst = clipped.getChannelData(c);
      for (let i = 0; i < keep; i++) {
        const w = weights[i];
        dst[i] = w > 1e-4 ? Math.max(-1, Math.min(1, src[i] / w)) : src[i];
      }
    }
    return clipped;
  }

  async function pitchShiftBuffer(buf, semitones) {
    if (Math.abs(semitones) < 0.01) return buf;
    const ratio = Math.pow(2, semitones / 12);
    const stretched = await changeSpeed(buf, 1 / ratio);
    return resamplePlayback(stretched, ratio);
  }

  async function tuneSlice(slice, { gain = 1, st = 0, speed = 1 } = {}) {
    let out = slice;
    if (Math.abs(speed - 1) >= 0.01) out = await changeSpeed(out, speed);
    if (Math.abs(st) >= 0.01) out = await pitchShiftBuffer(out, st);
    if (Math.abs(gain - 1) >= 0.01) out = applyGainBuffer(out, gain);
    return out;
  }

  async function tunedSelection(buf, startSec, endSec, gain, semitones, speed = 1) {
    const slice = sliceBuffer(buf, startSec, endSec);
    const tuned = await tuneSlice(slice, { gain, st: semitones, speed });
    const out = replaceRange(buf, startSec, endSec, matchChannels(tuned, buf.numberOfChannels));
    return { buffer: out, start: startSec, end: startSec + tuned.duration };
  }

  function resetTuneSliders() {
    if (els.selVol) els.selVol.value = "100";
    if (els.selPitch) els.selPitch.value = "0";
    if (els.selSpeed) els.selSpeed.value = "100";
    if (state.buffer) refreshUi();
  }

  function padStartSilence(buf, delaySec) {
    const extra = Math.max(0, Math.round(delaySec * buf.sampleRate));
    if (extra < 1) return buf;
    const out = new AudioBuffer({
      length: buf.length + extra,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: buf.sampleRate,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c), extra);
    }
    return out;
  }

  const secondVoicePresets = {
    double: { st: 0.08, delay: 0.068, vol: 0.34, done: "Double voice added on top." },
    third: { st: 4, delay: 0.072, vol: 0.28, done: "High third added on top." },
    fifth: { st: 7, delay: 0.062, vol: 0.28, done: "Fifth above added on top." },
    octave: { st: -12, delay: 0.055, vol: 0.32, done: "Octave below added on top." },
  };

  async function applySecondVoice(preset) {
    if (!state.buffer) return;
    clampSel();
    if (state.sel.end - state.sel.start < 0.2) {
      toast("Drag a longer selection, then add a second voice.");
      return;
    }
    toast("Building second voice…");
    await nextPaint();
    try {
      let voice = sliceBuffer(state.buffer, state.sel.start, state.sel.end);
      if (Math.abs(preset.st) >= 0.01) voice = await pitchShiftBuffer(voice, preset.st);
      voice = applyGainBuffer(voice, preset.vol);
      voice = padStartSilence(voice, preset.delay);
      voice = matchChannels(voice, state.buffer.numberOfChannels);
      const next = mixOnto(state.buffer, state.sel.start, voice, 1);
      setClip(next, state.name, { keepSel: true, selectRange: { start: state.sel.start, end: state.sel.end } });
      toast(preset.done);
    } catch (err) {
      console.error(err);
      toast("Could not add that second voice.");
    }
  }

  function fftRadix2(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((inverse ? 2 : -2) * Math.PI) / len;
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wRe = 1;
        let wIm = 0;
        const half = len >> 1;
        for (let j = 0; j < half; j++) {
          const uRe = re[i + j];
          const uIm = im[i + j];
          const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
          const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + half] = uRe - vRe;
          im[i + j + half] = uIm - vIm;
          const nRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nRe;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }

  async function denoiseChannel(src, amount) {
    const nfft = 2048;
    const hop = 512;
    const n = src.length;
    const bins = nfft >> 1;
    const win = new Float32Array(nfft);
    for (let i = 0; i < nfft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, nfft - 1));
    const frameCount = Math.max(1, Math.floor(Math.max(0, n - nfft) / hop) + 1);
    const rms = new Float32Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
      const pos = f * hop;
      let e = 0;
      for (let i = 0; i < nfft; i++) {
        const v = (pos + i < n ? src[pos + i] : 0) * win[i];
        e += v * v;
      }
      rms[f] = Math.sqrt(e / nfft);
    }
    const order = Array.from({ length: frameCount }, (_, i) => i).sort((a, b) => rms[a] - rms[b]);
    const quietN = Math.max(3, Math.min(frameCount, Math.floor(frameCount * 0.14)));
    const noise = new Float32Array(bins + 1);
    const re = new Float32Array(nfft);
    const im = new Float32Array(nfft);
    for (let q = 0; q < quietN; q++) {
      const pos = order[q] * hop;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < nfft; i++) re[i] = (pos + i < n ? src[pos + i] : 0) * win[i];
      fftRadix2(re, im, false);
      for (let k = 0; k <= bins; k++) noise[k] += Math.hypot(re[k], im[k]);
    }
    for (let k = 0; k <= bins; k++) noise[k] /= quietN;
    const sm = new Float32Array(bins + 1);
    for (let k = 0; k <= bins; k++) {
      sm[k] = (noise[Math.max(0, k - 1)] + noise[k] + noise[Math.min(bins, k + 1)]) / 3;
    }
    const acc = new Float32Array(n + nfft);
    const wsum = new Float32Array(n + nfft);
    const floor = 1 - amount * 0.9;
    const oversub = 1 + amount * 2.4;
    const expn = 0.4 + amount * 1.1;
    for (let f = 0; f < frameCount; f++) {
      const pos = f * hop;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < nfft; i++) re[i] = (pos + i < n ? src[pos + i] : 0) * win[i];
      fftRadix2(re, im, false);
      for (let k = 0; k <= bins; k++) {
        const mag = Math.hypot(re[k], im[k]);
        let g = mag / (sm[k] * oversub + 1e-8);
        g = (g * g) / (g * g + 1);
        g = floor + (1 - floor) * Math.pow(Math.max(0, g), expn);
        if (k <= 2) g *= 1 - amount * 0.8;
        re[k] *= g;
        im[k] *= g;
        if (k > 0 && k < bins) {
          re[nfft - k] *= g;
          im[nfft - k] *= g;
        }
      }
      fftRadix2(re, im, true);
      for (let i = 0; i < nfft; i++) {
        acc[pos + i] += re[i] * win[i];
        wsum[pos + i] += win[i] * win[i];
      }
      if (f % 70 === 0) await nextPaint();
    }
    const dest = new Float32Array(n);
    for (let i = 0; i < n; i++) dest[i] = wsum[i] > 1e-6 ? Math.max(-1, Math.min(1, acc[i] / wsum[i])) : 0;
    return dest;
  }

  async function denoiseBuffer(buf, amount) {
    const out = new AudioBuffer({
      length: buf.length,
      numberOfChannels: buf.numberOfChannels,
      sampleRate: buf.sampleRate,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(await denoiseChannel(buf.getChannelData(c), amount));
    }
    return out;
  }

  function stripVocalsRange(buf, startSec, endSec, amount) {
    if (buf.numberOfChannels < 2) throw new Error("Voice strip needs a stereo song (left and right).");
    const out = cloneBuffer(buf);
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const end = Math.min(buf.length, Math.floor(endSec * sr));
    const L = out.getChannelData(0);
    const R = out.getChannelData(1);
    const strength = Math.max(0, Math.min(1, amount));
    // Soft curve: less hollow at mid settings, still strong near 100%.
    const cut = Math.pow(strength, 0.85) * 0.92;
    // Band-limited mid cut: protect bass/kick, strip mainly vocal range.
    const loHz = 180;
    const hiHz = 4200;
    const aLo = Math.exp((-2 * Math.PI * loHz) / sr);
    const aHi = Math.exp((-2 * Math.PI * hiHz) / sr);
    let midLp = 0;
    let bandLp = 0;
    for (let i = start; i < end; i++) {
      const mid = (L[i] + R[i]) * 0.5;
      const side = (L[i] - R[i]) * 0.5;
      midLp = aLo * midLp + (1 - aLo) * mid;
      const high = mid - midLp;
      bandLp = aHi * bandLp + (1 - aHi) * high;
      const vocalBand = bandLp;
      // Keep low mid (bass) and extreme highs; cut centered vocal band.
      const newMid = mid - vocalBand * cut;
      // Mild side lift so music doesn't collapse after mid cut.
      const newSide = side * (1 + 0.12 * cut);
      L[i] = Math.max(-1, Math.min(1, newMid + newSide));
      R[i] = Math.max(-1, Math.min(1, newMid - newSide));
    }
    return out;
  }

  function analyzePitch(frame, sr) {
    const n = frame.length;
    let rms = 0;
    let zcr = 0;
    for (let i = 0; i < n; i++) {
      rms += frame[i] * frame[i];
      if (i && ((frame[i] >= 0) !== (frame[i - 1] >= 0))) zcr++;
    }
    rms = Math.sqrt(rms / n);
    zcr = zcr / n;
    if (rms < 0.012) return { rms, zcr, hz: 0, conf: 0 };

    const minLag = Math.floor(sr / 500);
    const maxLag = Math.min(Math.floor(sr / 80), n - 1);
    let bestLag = 0;
    let best = 0;
    let energy0 = 0;
    for (let i = 0; i < n; i++) energy0 += frame[i] * frame[i];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i += 2) corr += frame[i] * frame[i + lag];
      if (corr > best) {
        best = corr;
        bestLag = lag;
      }
    }
    const conf = energy0 > 0 ? (best * 2) / energy0 : 0;
    const hz = bestLag ? sr / bestLag : 0;
    return { rms, zcr, hz, conf };
  }

  function findVoiceParts(buf) {
    const sr = buf.sampleRate;
    const ch = buf.getChannelData(0);
    const hop = Math.floor(sr * 0.05);
    const size = Math.floor(sr * 0.04);
    const frames = [];
    const tmp = new Float32Array(size);
    for (let i = 0; i + size < ch.length; i += hop) {
      tmp.set(ch.subarray(i, i + size));
      const a = analyzePitch(tmp, sr);
      let kind = "silence";
      if (a.rms >= 0.012) {
        const voiceLike = a.conf > 0.35 && a.hz >= 80 && a.hz <= 420 && a.zcr < 0.18;
        kind = voiceLike ? "voice" : "music";
      }
      frames.push({ start: i / sr, end: (i + hop) / sr, kind });
    }
    const segs = [];
    frames.forEach((f) => {
      const last = segs[segs.length - 1];
      if (last && last.kind === f.kind && f.start - last.end < 0.12) last.end = f.end;
      else segs.push({ start: f.start, end: f.end, kind: f.kind });
    });
    return segs.filter((s) => s.end - s.start >= 0.18 && s.kind !== "silence");
  }

  function renderSegList() {
    els.segList.innerHTML = "";
    state.segments.forEach((seg) => {
      const row = document.createElement("div");
      row.className = "seg";
      row.innerHTML = `<span class="tag ${seg.kind}">${seg.kind}</span><b>${fmt(seg.start)} – ${fmt(seg.end)}</b>`;
      const sel = document.createElement("button");
      sel.className = "text-btn";
      sel.textContent = "Select";
      sel.addEventListener("click", () => {
        state.sel = { start: seg.start, end: seg.end };
        refreshUi();
      });
      const rm = document.createElement("button");
      rm.className = "text-btn";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        try {
          const next = cutOutBuffer(state.buffer, seg.start, seg.end);
          setClip(next, state.name);
          toast("Removed that part.");
        } catch (err) {
          toast(err.message || "Could not remove.");
        }
      });
      row.appendChild(sel);
      row.appendChild(rm);
      els.segList.appendChild(row);
    });
    if (!state.segments.length) {
      els.segList.innerHTML = `<p class="tiny">No voice-like or music parts found.</p>`;
    }
  }

  async function commitOverdubTake() {
    if (state.overdubLock) return;
    state.overdubLock = true;
    const rec = state.overdubRec;
    const stream = state.overdubStream;
    const mode = state.overdubMode;
    const sel = { start: state.sel.start, end: state.sel.end };
    const chunks = state.recChunks.slice();
    const mime = rec && rec.mimeType;
    state.overdubRec = null;
    state.overdubStream = null;
    stopPlayback();
    els.overdubBtn.classList.remove("recording");
    updateOverdubLabel();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try {
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      if (blob.size < 50) {
        toast("Nothing was recorded.");
        els.overdubStatus.textContent = "";
        return;
      }
      const raw = await decodeFile(new File([blob], "take.webm", { type: blob.type }));
      const take = await fitToClip(raw, state.buffer);
      let next;
      if (mode === "instead") {
        next = replaceRange(state.buffer, sel.start, sel.end, take);
        setClip(next, state.name, { selectRange: { start: sel.start, end: sel.start + take.duration } });
        toast("Replaced that section with your take.");
      } else {
        next = mixOnto(state.buffer, sel.start, take, 1);
        setClip(next, state.name, { selectRange: { start: sel.start, end: sel.start + take.duration } });
        toast("Mixed your take on top.");
      }
      els.overdubStatus.textContent = "";
    } catch (err) {
      console.error(err);
      toast("Could not mix that recording in.");
      els.overdubStatus.textContent = "";
    } finally {
      state.overdubLock = false;
    }
  }

  async function startOverdub() {
    if (state.overdubRec) {
      try { state.overdubRec.stop(); } catch (_) {}
      return;
    }
    if (!state.buffer) return;
    clampSel();
    stopPlayback();
    try {
      const ctx = audioCtx();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const rec = new MediaRecorder(stream);
      state.recChunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) state.recChunks.push(e.data); };
      rec.onstop = () => { commitOverdubTake(); };
      rec.start(120);
      state.overdubRec = rec;
      state.overdubStream = stream;
      els.overdubBtn.classList.add("recording");
      els.overdubBtn.textContent = "Stop recording";
      els.overdubStatus.textContent = "Playing the selected part — sing now. Headphones help.";

      const src = ctx.createBufferSource();
      src.buffer = state.buffer;
      src.connect(ctx.destination);
      const dur = Math.max(0.05, state.sel.end - state.sel.start);
      src.start(0, state.sel.start, dur);
      src.onended = () => {
        if (state.overdubRec && state.overdubRec.state === "recording") {
          try { state.overdubRec.stop(); } catch (_) {}
        }
      };
      state.sources.push(src);
      state.playing = true;
      state.playOffset = state.sel.start;
      state.playUntil = state.sel.end;
      state.playStartedAt = ctx.currentTime;
      tick();
    } catch (err) {
      toast("Microphone permission is needed to record on top.");
      console.error(err);
    }
  }

  function safeName() {
    return (state.name || "clip").replace(/[^\w\- ]+/g, "").slice(0, 40) || "clip";
  }

  async function generateAiSinging() {
    const sr = 44100;
    const duration = 11;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * duration), sr);
    const root = [220, 246.94, 261.63, 293.66][Math.floor(Math.random() * 4)];
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const vowels = [
      [800, 1150, 2800],
      [350, 2000, 2600],
      [270, 2300, 3000],
      [450, 800, 2700],
      [325, 700, 2500],
    ];
    const bpm = 78 + Math.floor(Math.random() * 20);
    const beat = 60 / bpm;
    let t = 0.25;
    const notes = 14 + Math.floor(Math.random() * 6);

    for (let n = 0; n < notes && t < duration - 0.6; n++) {
      if (Math.random() < 0.12) {
        t += beat * 0.5;
        continue;
      }
      const freq = root * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
      const len = beat * (Math.random() < 0.35 ? 1 : 0.5);
      const formants = vowels[n % vowels.length];

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);

      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(freq, t);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 4.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfoGain.connect(body.frequency);

      let node = osc;
      formants.forEach((f, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = 8 - i * 1.5;
        node.connect(bp);
        node = bp;
      });

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.1, t + len * 0.55);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);

      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.1;
      const master = ctx.createGain();
      master.gain.value = 1.15;

      node.connect(env);
      body.connect(bodyGain);
      env.connect(master);
      bodyGain.connect(master);

      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.18;
      const fb = ctx.createGain();
      fb.gain.value = 0.22;
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      master.connect(ctx.destination);
      master.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(ctx.destination);

      osc.start(t);
      body.start(t);
      lfo.start(t);
      osc.stop(t + len + 0.02);
      body.stop(t + len + 0.02);
      lfo.stop(t + len + 0.02);
      t += len;
    }

    return ctx.startRendering();
  }

  async function loadFromFile(file) {
    try {
      const buf = await decodeFile(file);
      setClip(buf, file.name.replace(/\.[^.]+$/, ""), { remember: false });
      state.history = [];
      els.undoBtn.disabled = true;
      toast(`Loaded ${file.name}`);
    } catch (err) {
      toast("Could not read that audio file.");
      console.error(err);
    }
  }

  async function startRecording() {
    if (state.recorder) {
      state.recorder.stop();
      return;
    }
    if (state.overdubRec) {
      toast("Stop the selection recording first.");
      return;
    }
    try {
      const ctx = audioCtx();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) || undefined;
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      state.recChunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) state.recChunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(state.recTimer);
        els.recordBtn.classList.remove("recording");
        els.recordLabel.textContent = "Record instead";
        els.recordHint.textContent = "Uses your microphone";
        state.recorder = null;
        const blob = new Blob(state.recChunks, { type: rec.mimeType || "audio/webm" });
        const file = new File([blob], "recording.webm", { type: blob.type });
        await loadFromFile(file);
      };
      rec.start();
      state.recorder = rec;
      state.recStart = Date.now();
      els.recordBtn.classList.add("recording");
      els.recordLabel.textContent = "Stop recording";
      state.recTimer = setInterval(() => {
        const s = ((Date.now() - state.recStart) / 1000).toFixed(1);
        els.recordHint.textContent = `${s}s — click to stop`;
      }, 200);
    } catch (err) {
      toast("Microphone permission is needed to record.");
      console.error(err);
    }
  }

  els.fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadFromFile(file);
    e.target.value = "";
  });

  els.recordBtn.addEventListener("click", startRecording);

  els.aiBtn.addEventListener("click", async () => {
    audioCtx();
    els.aiBtn.disabled = true;
    toast("Composing a random sung line…");
    try {
      const buf = await generateAiSinging();
      setClip(buf, "AI singing", { remember: false });
      state.history = [];
      els.undoBtn.disabled = true;
      toast("AI singing is ready — select a piece and cut.");
    } catch (err) {
      toast("Could not generate singing.");
      console.error(err);
    } finally {
      els.aiBtn.disabled = false;
    }
  });

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
      updateApplyLabel();
      drawWave();
    });
  });

  els.applyCutBtn.addEventListener("click", () => {
    if (!state.buffer) return;
    clampSel();
    try {
      let next;
      if (state.mode === "keep") {
        next = sliceBuffer(state.buffer, state.sel.start, state.sel.end);
        setClip(next, state.name);
        toast(`Kept ${fmt(els.tStart.valueAsNumber || state.sel.start)} – ${fmt(state.sel.end)}.`);
      } else {
        next = cutOutBuffer(state.buffer, state.sel.start, state.sel.end);
        setClip(next, state.name);
        toast("Cut that middle out and joined the two pieces.");
      }
    } catch (err) {
      toast(err.message || "Could not cut.");
    }
  });

  els.applyEchoBtn.addEventListener("click", async () => {
    if (!state.buffer) return;
    els.applyEchoBtn.disabled = true;
    toast("Adding echo…");
    await nextPaint();
    try {
      const next = await applyEcho(state.buffer, Number(els.echoAmt.value));
      await nextPaint();
      setClip(next, state.name);
      toast("Studio echo added.");
    } catch (err) {
      console.error(err);
      toast("Could not add echo.");
    } finally {
      els.applyEchoBtn.disabled = false;
    }
  });

  els.playBtn.addEventListener("click", () => {
    if (state.overdubRec) {
      try { state.overdubRec.stop(); } catch (_) {}
      return;
    }
    playFromBar("a");
  });

  els.playSelBtn.addEventListener("click", () => {
    playSelOf("a");
  });

  if (els.playBBtn) {
    els.playBBtn.addEventListener("click", () => playFromBar("b"));
  }
  if (els.playBSelBtn) {
    els.playBSelBtn.addEventListener("click", () => playSelOf("b"));
  }
  if (els.skipBackBtn) els.skipBackBtn.addEventListener("click", () => skipBar(-1, "a"));
  if (els.skipFwdBtn) els.skipFwdBtn.addEventListener("click", () => skipBar(1, "a"));
  if (els.skipFwd5Btn) els.skipFwd5Btn.addEventListener("click", () => skipBar(5, "a"));

  els.tStart.addEventListener("input", () => {
    state.sel.start = Number(els.tStart.value) || 0;
    refreshUi();
  });
  els.tEnd.addEventListener("input", () => {
    state.sel.end = Number(els.tEnd.value) || 0;
    refreshUi();
  });
  els.fullSelBtn.addEventListener("click", () => {
    if (!state.buffer) return;
    state.sel = { start: 0, end: state.buffer.duration };
    refreshUi();
  });
  els.echoAmt.addEventListener("input", refreshUi);

  els.undoBtn.addEventListener("click", () => {
    const prev = state.history.pop();
    if (!prev) {
      els.undoBtn.disabled = true;
      return;
    }
    state.buffer = prev;
    state.peaks = null;
    state.sel = { start: 0, end: prev.duration };
    els.undoBtn.disabled = state.history.length === 0;
    refreshUi();
    toast("Undid last edit.");
  });

  els.newClipBtn.addEventListener("click", () => {
    stopPlayback();
    state.buffer = null;
    state.layer = null;
    resetLayerNav();
    state.history = [];
    els.editor.classList.add("hidden");
    els.layerLoaded.classList.add("hidden");
    els.layerEmpty.classList.remove("hidden");
    els.undoBtn.disabled = true;
  });

  els.layerInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !state.buffer) return;
    try {
      state.layer = await decodeFile(file);
      state.layerName = file.name;
      els.layerName.textContent = file.name;
      els.layerEmpty.classList.add("hidden");
      els.layerLoaded.classList.remove("hidden");
      resetLayerNav();
      toast("Second clip ready. Map pieces with arrows, or merge the whole layer.");
    } catch (err) {
      toast("Could not read the second file.");
    }
  });

  els.playMixBtn.addEventListener("click", () => {
    if (!state.buffer || !state.layer) return;
    if (state.playing) {
      stopPlayback();
      drawWave();
      return;
    }
    els.playMixBtn.textContent = "Stop";
    playBuffer(state.buffer, 0, Math.max(state.buffer.duration, state.layer.duration), { mixLayer: true });
  });

  els.mergeBtn.addEventListener("click", async () => {
    if (!state.buffer || !state.layer) return;
    els.mergeBtn.disabled = true;
    try {
      if (state.layerMaps.length) {
        toast("Placing layer pieces on the main clip…");
        await nextPaint();
        const next = await applyLayerMaps();
        setClip(next, state.name);
        toast("Layer pieces placed. Main clip kept; mapped parts applied.");
      } else {
        const mixed = await mixBuffers(
          state.buffer,
          state.layer,
          Number(els.volMain.value) / 100,
          Number(els.volLayer.value) / 100
        );
        setClip(mixed, `${state.name} + layer`);
        toast("Merged. Both voices are in one clip.");
      }
      state.layer = null;
      resetLayerNav();
      els.layerLoaded.classList.add("hidden");
      els.layerEmpty.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      toast("Could not merge.");
    } finally {
      els.mergeBtn.disabled = false;
    }
  });

  els.clearLayerBtn.addEventListener("click", () => {
    state.layer = null;
    resetLayerNav();
    els.layerLoaded.classList.add("hidden");
    els.layerEmpty.classList.remove("hidden");
  });

  if (els.layerMapAddBtn) els.layerMapAddBtn.addEventListener("click", addLayerArrow);
  document.querySelectorAll("[data-layermode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.layerMapMode = btn.dataset.layermode;
      document.querySelectorAll("[data-layermode]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
  if (els.layerMapList) {
    els.layerMapList.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-mapmode]");
      if (!sel) return;
      const id = Number(sel.dataset.mapmode);
      const row = state.layerMaps.find((m) => m.id === id);
      if (row) row.mode = sel.value;
    });
    els.layerMapList.addEventListener("click", (e) => {
      const del = e.target.closest("[data-mapdel]");
      if (!del) return;
      const id = Number(del.dataset.mapdel);
      state.layerMaps = state.layerMaps.filter((m) => m.id !== id);
      renderLayerMapList();
      drawLayerMap();
    });
  }
  bindLayerMini(els.layerMapMain, "main");
  bindLayerMini(els.layerMapLayer, "layer");

  els.downloadWavBtn.addEventListener("click", () => saveDownload("wav"));

  els.downloadMp3Btn.addEventListener("click", () => saveDownload("mp3"));

  els.downloadMp4Btn.addEventListener("click", () => saveDownload("mp4"));

  document.querySelectorAll("[data-overdub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.overdubMode = btn.dataset.overdub;
      document.querySelectorAll("[data-overdub]").forEach((b) => b.classList.toggle("active", b === btn));
      updateOverdubLabel();
    });
  });
  els.overdubBtn.addEventListener("click", startOverdub);

  ["selVol", "selPitch", "selSpeed", "vocalAmt", "noiseAmt"].forEach((id) => {
    if (els[id]) els[id].addEventListener("input", () => {
      refreshUi();
      if (id === "selVol" && state.liveGain) {
        state.liveGain.gain.setTargetAtTime(Number(els.selVol.value) / 100, audioCtx().currentTime, 0.02);
      }
    });
  });

  async function applyTune({ gain, st, speed, label }) {
    if (!state.buffer) return;
    clampSel();
    if (state.sel.end - state.sel.start < 0.12) {
      toast("Drag a longer selection, then apply volume / pitch / speed.");
      return;
    }
    const g = gain;
    const semitones = st;
    const spd = speed;
    if (Math.abs(g - 1) < 0.01 && Math.abs(semitones) < 0.01 && Math.abs(spd - 1) < 0.01) {
      toast("Move volume, pitch, or speed, then apply.");
      return;
    }
    toast(label || "Applying…");
    await nextPaint();
    try {
      const { buffer, start, end } = await tunedSelection(
        state.buffer,
        state.sel.start,
        state.sel.end,
        g,
        semitones,
        spd
      );
      setClip(buffer, state.name, { selectRange: { start, end } });
      resetTuneSliders();
      toast("Applied to the selection.");
    } catch (err) {
      console.error(err);
      toast("Could not apply that change.");
    }
  }

  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const speed = Number(btn.dataset.speed);
      if (els.selSpeed) els.selSpeed.value = String(Math.round(speed * 100));
      refreshUi();
      if (Math.abs(speed - 1) < 0.01) {
        toast("Speed is 1× — nothing to apply.");
        return;
      }
      const { gain, st } = currentTune();
      await applyTune({
        gain,
        st,
        speed,
        label: `Applying ${speed}× speed…`,
      });
    });
  });

  els.previewTuneBtn.addEventListener("click", async () => {
    if (!state.buffer) return;
    clampSel();
    const { st, speed } = currentTune();
    state.playTrack = "a";
    toast("Hearing the selection…");
    try {
      const tuned = await tuneSlice(sliceBuffer(state.buffer, state.sel.start, state.sel.end), { gain: 1, st, speed });
      playBuffer(tuned, 0, tuned.duration, { headAt: state.sel.start, playScale: speed });
    } catch (err) {
      console.error(err);
      toast("Could not preview.");
    }
  });

  els.applyTuneBtn.addEventListener("click", async () => {
    els.applyTuneBtn.disabled = true;
    try {
      await applyTune({
        gain: Number(els.selVol.value) / 100,
        st: Number(els.selPitch.value),
        speed: Number(els.selSpeed.value) / 100,
        label: "Applying to selection…",
      });
    } finally {
      els.applyTuneBtn.disabled = false;
    }
  });

  async function runNoiseClean(apply) {
    if (!state.buffer) return;
    clampSel();
    if (state.sel.end - state.sel.start < 0.2) {
      toast("Drag a longer selection, then clean noise.");
      return;
    }
    const amount = Number(els.noiseAmt.value) / 100;
    if (amount < 0.02) {
      toast("Turn Amount up, then clean.");
      return;
    }
    toast(apply ? "Cleaning noise…" : "Hearing a cleaned preview…");
    await nextPaint();
    try {
      const slice = sliceBuffer(state.buffer, state.sel.start, state.sel.end);
      const cleaned = await denoiseBuffer(slice, amount);
      if (apply) {
        const next = replaceRange(state.buffer, state.sel.start, state.sel.end, cleaned);
        setClip(next, state.name, { selectRange: { start: state.sel.start, end: state.sel.start + cleaned.duration } });
        toast("Cleaned noise in the selection.");
      } else {
        state.playTrack = "a";
        playBuffer(cleaned, 0, cleaned.duration, { headAt: state.sel.start, playScale: 1 });
      }
    } catch (err) {
      console.error(err);
      toast("Could not clean noise.");
    }
  }

  if (els.previewNoiseBtn) {
    els.previewNoiseBtn.addEventListener("click", () => runNoiseClean(false));
  }
  if (els.applyNoiseBtn) {
    els.applyNoiseBtn.addEventListener("click", async () => {
      els.applyNoiseBtn.disabled = true;
      try {
        await runNoiseClean(true);
      } finally {
        els.applyNoiseBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll("[data-harmony]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const preset = secondVoicePresets[btn.dataset.harmony];
      if (!preset) return;
      btn.disabled = true;
      try {
        await applySecondVoice(preset);
      } finally {
        btn.disabled = false;
      }
    });
  });

  els.stripVoiceBtn.addEventListener("click", () => {
    if (!state.buffer) return;
    try {
      const next = stripVocalsRange(state.buffer, state.sel.start, state.sel.end, Number(els.vocalAmt.value) / 100);
      setClip(next, state.name, { keepSel: true, selectRange: { ...state.sel } });
      toast("Stripped centered voice from the selection.");
    } catch (err) {
      toast(err.message || "Could not strip voice.");
    }
  });

  els.findPartsBtn.addEventListener("click", () => {
    if (!state.buffer) return;
    toast("Listening for voice-like parts…");
    setTimeout(() => {
      state.segments = findVoiceParts(state.buffer);
      renderSegList();
      drawWave();
      toast(`Found ${state.segments.length} part${state.segments.length === 1 ? "" : "s"}.`);
    }, 30);
  });

  els.removeVoicePartsBtn.addEventListener("click", () => {
    if (!state.buffer) return;
    if (!state.segments.length) state.segments = findVoiceParts(state.buffer);
    const voices = state.segments.filter((s) => s.kind === "voice").sort((a, b) => b.start - a.start);
    if (!voices.length) {
      toast("No voice-like parts to remove.");
      return;
    }
    let next = state.buffer;
    voices.forEach((seg) => {
      next = cutOutBuffer(next, seg.start, seg.end);
    });
    setClip(next, state.name);
    toast(`Removed ${voices.length} voice-like part${voices.length === 1 ? "" : "s"}.`);
  });

  function endWaveDrag(e) {
    const canvas = state.dragTrack === "b" ? els.waveB : els.wave;
    if (e && e.pointerId != null && canvas) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    const track = state.dragTrack === "b" ? "b" : "a";
    const resume = (state.playing && state.playTrack === track &&
      (state.drag === "maybe" || state.drag === "playhead"))
      || (state.drag === "playhead" && state.resumeAfterScrub);
    if (state.drag === "maybe" || state.drag === "playhead") {
      const t = state.drag === "maybe"
        ? (state.dragStartT || 0)
        : (track === "b" ? state.playheadB : state.playheadA);
      if (state.playing) stopPlayback({ keepHead: true });
      if (track === "b") state.playheadB = t;
      else state.playheadA = t;
    }
    state.drag = null;
    state.resumeAfterScrub = false;
    if (state.dragTrack === "b") clampSelB();
    else if (state.buffer) clampSel();
    refreshUi();
    if (resume) playFromBar(track);
  }

  function beginWavePointer(track, canvas, buf, sel, e) {
    setActiveTrack(track);
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const t = xToTimeOn(canvas, buf, e.clientX);
    const handlePx = 14;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dur = buf.duration || 1;
    const xA = (sel.start / dur) * rect.width;
    const xB = (sel.end / dur) * rect.width;
    const head = track === "b" ? state.playheadB : state.playheadA;
    const xP = (head / dur) * rect.width;
    if (Math.abs(x - xA) < handlePx) state.drag = "start";
    else if (Math.abs(x - xB) < handlePx) state.drag = "end";
    else if (Math.abs(x - xP) < 12) {
      state.drag = "playhead";
      state.resumeAfterScrub = state.playing && state.playTrack === (track === "b" ? "b" : "a");
      if (state.resumeAfterScrub) stopPlayback({ keepHead: true });
    } else {
      state.drag = "maybe";
      state.dragStartX = e.clientX;
      state.dragStartT = t;
      if (track === "b") state.playheadB = t;
      else state.playheadA = t;
      updatePlayheadReadout();
    }
  }

  function moveWavePointer(track, canvas, buf, sel, e) {
    if (!state.drag || !buf || state.dragTrack !== track) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      endWaveDrag(e);
      return;
    }
    const t = xToTimeOn(canvas, buf, e.clientX);
    if (state.drag === "maybe") {
      if (Math.abs(e.clientX - state.dragStartX) < 8) return;
      state.drag = "new";
      sel.start = state.dragStartT;
      sel.end = t;
    } else if (state.drag === "playhead") {
      if (track === "b") state.playheadB = t;
      else state.playheadA = t;
      updatePlayheadReadout();
      if (track === "b") drawWaveB();
      else drawWave();
      return;
    } else if (state.drag === "start") sel.start = t;
    else if (state.drag === "end") sel.end = t;
    else {
      sel.end = t;
      if (sel.end < sel.start) {
        const tmp = sel.start;
        sel.start = sel.end;
        sel.end = tmp;
        state.drag = "start";
      }
    }
    if (sel.start > sel.end) {
      const tmp = sel.start;
      sel.start = sel.end;
      sel.end = tmp;
      state.drag = state.drag === "start" ? "end" : "start";
    }
    if (track === "b") {
      clampSelB();
      if (els.selReadoutB) els.selReadoutB.textContent = `${fmt(state.selB.start)} – ${fmt(state.selB.end)} selected · click to set B’s bar`;
      drawWaveB();
    } else {
      clampSel();
      els.tStart.value = state.sel.start.toFixed(1);
      els.tEnd.value = state.sel.end.toFixed(1);
      els.selReadout.textContent = `${fmt(state.sel.start)} – ${fmt(state.sel.end)} selected`;
      drawWave();
    }
  }

  els.wave.addEventListener("pointerdown", (e) => {
    if (!state.buffer) return;
    beginWavePointer("a", els.wave, state.buffer, state.sel, e);
    drawWave();
  });

  els.wave.addEventListener("pointermove", (e) => {
    moveWavePointer("a", els.wave, state.buffer, state.sel, e);
  });

  els.wave.addEventListener("pointerup", endWaveDrag);
  els.wave.addEventListener("pointercancel", endWaveDrag);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      state.peaks = null;
      state.waveCache = null;
      state.peaksB = null;
      state.waveCacheB = null;
      drawWave();
      drawWaveB();
      drawLayerMap();
    }, 150);
  });

  if (els.waveB) {
    els.waveB.addEventListener("pointerdown", (e) => {
      if (!state.clipB) return;
      beginWavePointer("b", els.waveB, state.clipB, state.selB, e);
      drawWaveB();
    });
    els.waveB.addEventListener("pointermove", (e) => {
      moveWavePointer("b", els.waveB, state.clipB, state.selB, e);
    });
    els.waveB.addEventListener("pointerup", endWaveDrag);
    els.waveB.addEventListener("pointercancel", endWaveDrag);
  }

  if (els.copyABtn) els.copyABtn.addEventListener("click", () => copyFrom("a"));
  if (els.cutABtn) els.cutABtn.addEventListener("click", () => cutFrom("a"));
  if (els.pasteOnTopABtn) els.pasteOnTopABtn.addEventListener("click", () => pasteInto("a", "ontop"));
  if (els.pasteOnTopFixedABtn) els.pasteOnTopFixedABtn.addEventListener("click", () => pasteInto("a", "ontop-fixed"));
  if (els.pasteInsteadABtn) els.pasteInsteadABtn.addEventListener("click", () => pasteInto("a", "instead"));
  if (els.copyBBtn) els.copyBBtn.addEventListener("click", () => copyFrom("b"));
  if (els.cutBBtn) els.cutBBtn.addEventListener("click", () => cutFrom("b"));
  if (els.pasteOnTopBBtn) els.pasteOnTopBBtn.addEventListener("click", () => pasteInto("b", "ontop"));
  if (els.pasteOnTopFixedBBtn) els.pasteOnTopFixedBBtn.addEventListener("click", () => pasteInto("b", "ontop-fixed"));
  if (els.pasteInsteadBBtn) els.pasteInsteadBBtn.addEventListener("click", () => pasteInto("b", "instead"));
  if (els.clipBInput) {
    els.clipBInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const buf = await decodeFile(file);
        setClipB(buf, file.name.replace(/\.[^.]+$/, ""));
        setActiveTrack("b");
        toast("Clip B loaded. Copy a selection, then paste on A or B.");
      } catch (err) {
        toast("Could not read that audio file.");
      }
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space" && (state.buffer || state.clipB)) {
      e.preventDefault();
      if (state.dragTrack === "b" && state.clipB) playFromBar("b");
      else playFromBar("a");
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      skipBar(e.shiftKey ? 5 : 1, state.dragTrack === "b" && state.clipB ? "b" : "a");
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      skipBar(e.shiftKey ? -5 : -1, state.dragTrack === "b" && state.clipB ? "b" : "a");
    }
    const withMod = e.ctrlKey || e.metaKey;
    if (withMod && e.target.tagName !== "INPUT") {
      if (e.code === "KeyC") {
        e.preventDefault();
        copyFrom(state.dragTrack === "b" ? "b" : "a");
      }
      if (e.code === "KeyX") {
        e.preventDefault();
        cutFrom(state.dragTrack === "b" ? "b" : "a");
      }
      if (e.code === "KeyV" && state.clipboard) {
        e.preventDefault();
        pasteInto(state.dragTrack === "b" ? "b" : "a", state.pasteMode || "ontop");
      }
    }
  });

  window.addEventListener("scroll", () => {
    document.body.classList.remove("dragging");
  }, { passive: true });

  ["dragenter", "dragover"].forEach((ev) => {
    window.addEventListener(ev, (e) => {
      e.preventDefault();
      document.body.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    window.addEventListener(ev, (e) => {
      e.preventDefault();
      document.body.classList.remove("dragging");
    });
  });
  window.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio")) loadFromFile(file);
    else if (file) loadFromFile(file);
  });
})();
