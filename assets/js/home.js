// Homepage motion. Native scrolling throughout: nothing intercepts the wheel
// or touch. Pinned scenes map the page's scroll position to transform and
// opacity only, eased toward the target every frame so motion stays smooth on
// any input (wheel, trackpad, touch, keyboard, scrollbar).
(function () {
  "use strict";
  var doc = document.documentElement;
  clearTimeout(window.__mdWatchdog);
  doc.dataset.ready = "1"; // tests read this to prove the script ran
  var FX = doc.classList.contains("fx");
  var finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  var clamp = function (v, a, b) {
    return Math.min(b, Math.max(a, v));
  };
  var smooth = function (e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ---------- reveals (services, contact) ----------
  var revealAll = function (els) {
    els.forEach(function (el) {
      el.classList.add("in");
    });
  };
  var rv = Array.prototype.slice.call(document.querySelectorAll(".rv"));
  var io = null;
  if (!doc.classList.contains("js")) revealAll(rv);
  else {
    io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    rv.forEach(function (el) {
      if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in");
      else io.observe(el);
    });
  }

  // ---------- elements ----------
  var hero = document.getElementById("hero");
  var slogan = hero.querySelector(".slogan");
  var sub = hero.querySelector(".hero-sub");
  var cue = hero.querySelector(".cue");
  var scene = document.getElementById("work");
  var stage = document.getElementById("stage");
  var lib = document.getElementById("lib");
  // tiles: everything in the field. pieces: the real work, without the echo
  // stills that pad the field (build-home.mjs), for the viewer's count/order.
  var tiles = Array.prototype.slice.call(lib.querySelectorAll(".st"));
  var pieces = tiles.filter(function (t) {
    return !t.classList.contains("echo");
  });
  var labelA = document.getElementById("lib-a");
  var labelB = document.getElementById("lib-b");
  var restA = labelA.textContent,
    restB = labelB.textContent;

  // hp: hero progress; dx/dy: the field's drift (fraction of the stage, -1..1).
  var cur = { hp: 0, dx: 0, dy: 0 };
  var tgt = { hp: 0, dx: 0, dy: 0 };
  var first = true;
  var M = {};
  // The field drifts only for a mouse on a landscape screen; the stylesheet
  // gives it the 5% overhang that hides its edges under the same query.
  var driftQ = window.matchMedia(
    "(hover: hover) and (pointer: fine) and (min-aspect-ratio: 1/1)",
  );
  var DRIFT = 0.045; // max drift, as a share of the stage (< the 5% overhang)

  function measure() {
    M.vh = innerHeight;
    // Slogan -> gallery is one snap: hp runs 0 -> 1 over it, from the top of
    // the page to the gallery at rest under the header.
    M.heroTop = hero.offsetTop;
    M.heroRun = Math.max(
      1,
      scene.offsetTop -
        parseFloat(
          getComputedStyle(document.body).getPropertyValue("--hbar-h") || 77,
        ) -
        M.heroTop,
    );
    var foot = document.querySelector(".hfoot");
    if (foot)
      document.body.style.setProperty("--foot-h", foot.offsetHeight + "px");
    M.sw = stage.clientWidth;
    M.sh = stage.clientHeight;
    M.drift = FX && driftQ.matches;
    if (!M.drift) {
      tgt.dx = tgt.dy = cur.dx = cur.dy = 0;
      lib.style.removeProperty("--dx");
      lib.style.removeProperty("--dy");
      lib.style.removeProperty("--tx");
      lib.style.removeProperty("--ty");
    }
    float();
  }

  // No mouse (phones, tablets): the space turns slowly on its own while the
  // gallery is on screen, so the depth still reads. Off for reduced motion.
  var floatRaf = 0,
    libSeen = false;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  function floatFrame(ts) {
    floatRaf = 0;
    if (M.drift || !libSeen || still.matches) return;
    var t = ts / 1000;
    lib.style.setProperty("--tx", (Math.sin(t * 0.35) * 0.55).toFixed(4));
    lib.style.setProperty("--ty", (Math.sin(t * 0.23 + 1.3) * 0.45).toFixed(4));
    floatRaf = requestAnimationFrame(floatFrame);
  }
  function float() {
    if (FX && !M.drift && libSeen && !still.matches && !floatRaf)
      floatRaf = requestAnimationFrame(floatFrame);
  }
  if ("IntersectionObserver" in window)
    new IntersectionObserver(function (es) {
      libSeen = es[0].isIntersecting;
      float();
    }).observe(stage);

  function targets() {
    tgt.hp = clamp((scrollY - M.heroTop) / M.heroRun, 0, 1);
  }

  function paint() {
    // Slogan: lifts, grows slightly and dissolves over the first scroll.
    var hp = cur.hp;
    slogan.style.opacity = (1 - smooth(0.04, 0.62, hp)).toFixed(3);
    slogan.style.transform =
      "translate3d(0," +
      (-hp * 9).toFixed(2) +
      "vh,0) scale(" +
      (1 + hp * 0.14).toFixed(4) +
      ")";
    sub.style.opacity = (1 - smooth(0, 0.3, hp)).toFixed(3);
    cue.style.opacity = (1 - smooth(0, 0.12, hp)).toFixed(3);
    // The gallery's pieces spread out from the middle as it arrives.
    if (FX) lib.style.setProperty("--g", smooth(0.12, 1, hp).toFixed(4));
    // Phones: the field is taller than the screen. The camera looks from the
    // middle of what is on screen, so near and far planes slide past each
    // other as it scrolls (home.css `--poy`).
    if (FX && tall.matches)
      stage.style.setProperty(
        "--poy",
        ((innerHeight + 77) / 2 - stage.getBoundingClientRect().top).toFixed(1) + "px"
      );
    if (M.drift) {
      // Against the cursor: point right, the field slides left.
      lib.style.setProperty("--dx", (-cur.dx * DRIFT * M.sw).toFixed(1) + "px");
      lib.style.setProperty("--dy", (-cur.dy * DRIFT * M.sh).toFixed(1) + "px");
      // ...and the 3D space turns toward it (home.css: a few degrees).
      lib.style.setProperty("--tx", cur.dx.toFixed(4));
      lib.style.setProperty("--ty", cur.dy.toFixed(4));
    }
  }

  var tall = window.matchMedia("(max-aspect-ratio: 1/1)");
  var raf = 0,
    last = 0;
  function frame(ts) {
    raf = 0;
    var dt = last ? Math.min(64, ts - last) : 16.7;
    last = ts;
    targets();
    var k = first ? 1 : 1 - Math.pow(1 - 0.14, dt / 16.7);
    var kd = 1 - Math.pow(1 - 0.06, dt / 16.7); // the drift glides slower
    first = false;
    var moving = false;
    for (var key in tgt) {
      var d = tgt[key] - cur[key];
      if (Math.abs(d) > 0.0004) {
        cur[key] += d * (key === "hp" ? k : kd);
        moving = true;
      } else cur[key] = tgt[key];
    }
    paint();
    if (moving) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  stage.addEventListener("pointermove", function (e) {
    if (!M.drift || e.pointerType !== "mouse") return;
    // Hold still while the cursor is on a piece, so it can't slide out from
    // under the pointer that picked it.
    if (e.target.closest && e.target.closest(".st, .peek")) return;
    var r = stage.getBoundingClientRect();
    tgt.dx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    tgt.dy = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    kick();
  });

  // ---------- hover: name the piece, lift it, play a video ----------
  // The hovered piece is lifted out of the 3D space into a flat copy (.peek)
  // that grows over the field from where the piece sits. Inside the 3D space
  // Chrome can mis-sort video layers, so a neighbour could paint over a
  // piece brought forward; the flat copy above the space never can.
  var peek = document.createElement("div");
  peek.className = "peek";
  peek.hidden = true;
  peek.setAttribute("aria-hidden", "true");
  stage.appendChild(peek);
  var lifted = null,
    dropTimer = 0;
  function lift(t) {
    if (!FX) return;
    clearTimeout(dropTimer);
    if (lifted && lifted !== t) lifted.classList.remove("lifted");
    lifted = t;
    var sr = stage.getBoundingClientRect(),
      r = t.getBoundingClientRect();
    var a = r.height / r.width;
    // ~18% of the field wide (at least 1.6x the piece), never taller than 62%.
    var w = Math.max(r.width * 1.6, sr.width * 0.18);
    if (w * a > sr.height * 0.62) w = (sr.height * 0.62) / a;
    var h = w * a,
      pad = 12;
    var x = clamp(
      r.left + r.width / 2 - w / 2 - sr.left,
      pad,
      sr.width - w - pad,
    );
    var y = clamp(
      r.top + r.height / 2 - h / 2 - sr.top,
      pad,
      sr.height - h - pad,
    );
    peek.textContent = "";
    var img = document.createElement("img");
    img.alt = "";
    img.src = t.querySelector("img").currentSrc || t.dataset.poster;
    peek.appendChild(img);
    if (t.dataset.type === "video") {
      var v = makeVideo(t.dataset.src, t.dataset.poster);
      var own = t.querySelector("video"); // a near piece already playing: carry on from there
      if (own && !own.paused) v.currentTime = own.currentTime;
      peek.appendChild(v);
      var pp = v.play();
      if (pp && pp.catch) pp.catch(function () {});
    }
    peek.style.cssText =
      "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px";
    // FLIP: start on the piece, then grow to the lifted size.
    peek.style.transition = "none";
    peek.style.transform =
      "translate(" +
      (r.left - sr.left - x) +
      "px," +
      (r.top - sr.top - y) +
      "px) scale(" +
      r.width / w +
      ")";
    peek.hidden = false;
    peek.offsetWidth; // commit the start state
    peek.style.transition = "";
    peek.style.transform = "none";
    t.classList.add("lifted");
  }
  function drop() {
    if (!lifted) return;
    var t = lifted;
    lifted = null;
    var sr = stage.getBoundingClientRect(),
      r = t.getBoundingClientRect(),
      pr = peek.getBoundingClientRect();
    var x = pr.left - sr.left,
      y = pr.top - sr.top;
    peek.style.transform =
      "translate(" +
      (r.left - sr.left - x) +
      "px," +
      (r.top - sr.top - y) +
      "px) scale(" +
      r.width / pr.width +
      ")";
    dropTimer = setTimeout(function () {
      peek.hidden = true;
      peek.textContent = "";
      t.classList.remove("lifted");
    }, 320);
  }
  peek.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "mouse" && lifted && e.relatedTarget !== lifted)
      unlook(lifted);
  });
  // A press on the copy must not move focus: the piece's blur would drop the
  // copy before its click lands (after the viewer closes, focus is on it).
  peek.addEventListener("mousedown", function (e) {
    e.preventDefault();
  });
  peek.addEventListener("click", function () {
    if (lifted) lifted.click(); // the field's click handler opens the viewer
  });

  function look(t) {
    labelA.textContent = t.dataset.client;
    labelB.textContent = t.dataset.title.replace(/^.*? — /, "");
    lift(t);
  }
  function makeVideo(src, poster) {
    var v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    v.poster = poster;
    v.src = src;
    v.addEventListener("playing", function () {
      v.classList.add("on");
    });
    return v;
  }
  function play(t) {
    var v = t.querySelector("video");
    if (!v) {
      v = makeVideo(t.dataset.src, t.dataset.poster);
      t.appendChild(v);
    }
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function unlook(t) {
    labelA.textContent = restA;
    labelB.textContent = restB;
    drop();
  }

  // Near-level videos play on their own, muted, while the field is on screen
  // (not for reduced motion or Save-Data). Off screen, everything pauses.
  var autoOn = false;
  var autos = tiles.filter(function (t) {
    return t.dataset.auto;
  });
  var saveData = navigator.connection && navigator.connection.saveData;
  function autoplay(on) {
    on =
      on &&
      FX &&
      !saveData &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (on === autoOn) return;
    autoOn = on;
    autos.forEach(function (t) {
      if (on) play(t);
      else {
        var v = t.querySelector("video");
        if (v) v.pause();
      }
    });
  }
  if ("IntersectionObserver" in window && autos.length)
    new IntersectionObserver(
      function (es) {
        autoplay(es[0].isIntersecting);
      },
      { threshold: 0.35 },
    ).observe(stage);

  tiles.forEach(function (t) {
    t.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "mouse") look(t);
    });
    t.addEventListener("pointerleave", function (e) {
      // Moving onto its own lifted copy is not leaving.
      if (
        e.pointerType === "mouse" &&
        !(e.relatedTarget && peek.contains(e.relatedTarget))
      )
        unlook(t);
    });
    t.addEventListener("focus", function () {
      // Keyboard focus only: a tap also focuses, and lifting the copy over the
      // piece mid-tap sent the click to neither, so a tap opened nothing.
      if (t.matches(":focus-visible")) look(t);
    });
    t.addEventListener("blur", function () {
      unlook(t);
    });
  });

  // ---------- dark mode (the field only) ----------
  var dark = document.getElementById("lib-dark");
  var setDark = function (on) {
    scene.classList.toggle("dark", on);
    dark.setAttribute("aria-pressed", String(on));
    dark.textContent = on ? "Light mode" : "Dark mode";
  };
  try {
    if (localStorage.getItem("md-lib-dark") === "1") setDark(true);
  } catch (e) {}
  dark.hidden = false;
  dark.addEventListener("click", function () {
    var on = !scene.classList.contains("dark");
    setDark(on);
    try {
      localStorage.setItem("md-lib-dark", on ? "1" : "0");
    } catch (e) {}
  });

  // ---------- wire up ----------
  function onResize() {
    measure();
    first = true;
    kick();
  }
  measure();
  kick();
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", onResize);
  if (driftQ.addEventListener) driftQ.addEventListener("change", onResize);
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(onResize);
  addEventListener("load", onResize);

  // ---------- cursor-aware buttons ----------
  if (finePointer && doc.classList.contains("js")) {
    Array.prototype.forEach.call(
      document.querySelectorAll(".magnet"),
      function (b) {
        b.addEventListener("pointermove", function (e) {
          var r = b.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top;
          b.classList.add("tracking");
          b.style.setProperty(
            "--mx",
            clamp((x / r.width - 0.5) * 14, -7, 7).toFixed(1) + "px",
          );
          b.style.setProperty(
            "--my",
            clamp((y / r.height - 0.5) * 10, -5, 5).toFixed(1) + "px",
          );
          b.style.setProperty("--hx", x + "px");
          b.style.setProperty("--hy", y + "px");
        });
        b.addEventListener("pointerleave", function () {
          b.classList.remove("tracking");
          b.style.setProperty("--mx", "0px");
          b.style.setProperty("--my", "0px");
        });
      },
    );
  }

  // ---------- lightbox ----------
  var lb = document.getElementById("lb");
  if (lb && typeof lb.showModal === "function") {
    var lbStage = document.getElementById("lb-stage");
    var f = {
      n: "lb-n",
      title: "lb-title",
      client: "lb-client",
      caption: "lb-caption",
      credit: "lb-credit",
    };
    for (var key in f) f[key] = document.getElementById(f[key]);
    var current = null,
      opener = null;
    var bigScreen = window.matchMedia("(min-width: 900px)");
    var show = function (t) {
      current = t;
      lbStage.textContent = "";
      var el;
      if (t.dataset.type === "video") {
        el = document.createElement("video");
        el.controls = true;
        el.playsInline = true;
        el.autoplay = true;
        el.poster = t.dataset.poster;
        // The viewer gets the full master on big screens; phones keep the 1080 preview.
        el.src = (bigScreen.matches && t.dataset.full) || t.dataset.src;
      } else {
        el = document.createElement("img");
        el.src = t.dataset.src;
        el.alt = t.dataset.title;
      }
      el.width = +t.dataset.w;
      el.height = +t.dataset.hPx;
      lbStage.appendChild(el);
      f.n.textContent = pieces.indexOf(t) + 1 + " / " + pieces.length;
      f.title.textContent = t.dataset.title;
      f.client.textContent = t.dataset.client;
      f.caption.textContent = t.dataset.caption;
      f.credit.textContent = t.dataset.credit;
    };
    var step = function (d) {
      var i = pieces.indexOf(current);
      show(pieces[(i + d + pieces.length) % pieces.length]);
    };
    var close = function () {
      lbStage.textContent = "";
      if (lb.open) lb.close();
    };
    lib.addEventListener("click", function (e) {
      var t = e.target.closest(".st");
      if (!t || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (t.classList.contains("echo")) t = pieces[+t.dataset.of]; // a still opens its video
      e.preventDefault();
      unlook(t);
      opener = t;
      show(t);
      lb.showModal();
    });
    document.getElementById("lb-close").addEventListener("click", close);
    document.getElementById("lb-prev").addEventListener("click", function () {
      step(-1);
    });
    document.getElementById("lb-next").addEventListener("click", function () {
      step(1);
    });
    lb.addEventListener("close", function () {
      lbStage.textContent = "";
      if (opener) opener.focus({ preventScroll: true });
    });
    lb.addEventListener("click", function (e) {
      if (e.target === lb) close();
    });
    // On the document: showing a piece replaces the focused video, and focus
    // then falls to <body>, outside the dialog.
    document.addEventListener("keydown", function (e) {
      if (!lb.open) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    });
    var sx = null;
    lbStage.addEventListener(
      "touchstart",
      function (e) {
        sx = e.touches[0].clientX;
      },
      { passive: true },
    );
    lbStage.addEventListener("touchend", function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      sx = null;
    });
  }

  // ---------- contact form ----------
  var form = document.getElementById("cform");
  var status = document.getElementById("formStatus");
  var say = function (msg, cls) {
    status.textContent = msg;
    status.className = "form-status " + (cls || "");
  };
  if (/[?&]sent=1/.test(location.search)) say("Sent. We'll be in touch.", "ok");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements._honey.value) return; // bot
    var bad = null;
    Array.prototype.forEach.call(
      form.querySelectorAll("[required]"),
      function (el) {
        var invalid =
          !el.value.trim() ||
          (el.type === "email" &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
        el.setAttribute("aria-invalid", String(invalid));
        if (invalid && !bad) bad = el;
      },
    );
    if (bad) {
      say("Fill in the highlighted fields.", "err");
      bad.focus();
      return;
    }
    if (/PENDING-ACTIVATION/.test(form.dataset.ajax)) {
      say("The form is being set up. Try again shortly.", "err");
      return;
    }
    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (k !== "_honey" && k !== "_next") data[k] = v;
    });
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    say("Sending…");
    fetch(form.dataset.ajax, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (res.ok && String(res.j.success) === "true") {
          form.reset();
          say("Sent. We'll be in touch.", "ok");
        } else say("That didn't send. Try again in a minute.", "err");
      })
      .catch(function () {
        say("That didn't send. Check your connection and try again.", "err");
      })
      .then(function () {
        btn.disabled = false;
      });
  });
})();
