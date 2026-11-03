// /resume and /work behaviour. The pages are complete without this file;
// it adds reveals, autoplaying reels, cursor-aware buttons, gallery filters
// and the lightbox.
(function () {
  "use strict";
  var doc = document.documentElement;
  clearTimeout(window.__mdWatchdog);
  doc.dataset.ready = '1'; // tests read this to prove the script ran

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  var hasIO = "IntersectionObserver" in window;

  // ---------- reveals ----------
  var rv = Array.prototype.slice.call(document.querySelectorAll(".rv"));
  if (!hasIO || reduced) {
    rv.forEach(function (el) {
      el.classList.add("in");
    });
    doc.classList.remove("js");
  } else {
    var vh = window.innerHeight;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    rv.forEach(function (el) {
      // Anything already on screen at load shows immediately.
      if (el.getBoundingClientRect().top < vh) el.classList.add("in");
      else io.observe(el);
    });
  }

  // ---------- header responds to scroll ----------
  var bar = document.querySelector(".topbar");
  if (bar) {
    var onScroll = function () {
      bar.classList.toggle("scrolled", window.scrollY > 12);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------- autoplay videos only while on screen ----------
  var autos = document.querySelectorAll("video[data-autoplay]");
  if (autos.length && hasIO && !reduced) {
    var vio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) {
            if (v.preload === "none") v.preload = "auto";
            var p = v.play();
            if (p && p.catch) p.catch(function () {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: 0.35 },
    );
    Array.prototype.forEach.call(autos, function (v) {
      vio.observe(v);
    });
  }

  // ---------- cursor-aware buttons (capped at ~7px) ----------
  if (finePointer && !reduced) {
    Array.prototype.forEach.call(
      document.querySelectorAll(".magnet"),
      function (b) {
        b.addEventListener("pointermove", function (e) {
          var r = b.getBoundingClientRect();
          var x = e.clientX - r.left,
            y = e.clientY - r.top;
          var dx = (x / r.width - 0.5) * 14,
            dy = (y / r.height - 0.5) * 10;
          b.classList.add("tracking");
          b.style.setProperty(
            "--mx",
            Math.max(-7, Math.min(7, dx)).toFixed(1) + "px",
          );
          b.style.setProperty(
            "--my",
            Math.max(-5, Math.min(5, dy)).toFixed(1) + "px",
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

  // ---------- gallery ----------
  var grid = document.getElementById("grid");
  if (!grid) return;
  var tiles = Array.prototype.slice.call(grid.querySelectorAll(".tile"));
  var countEl = document.getElementById("count");
  var emptyEl = document.getElementById("empty");
  var state = { kind: "all", project: "all" };

  function visible() {
    return tiles.filter(function (t) {
      return !t.hidden;
    });
  }

  function apply(push) {
    var n = 0;
    tiles.forEach(function (t) {
      var ok =
        (state.kind === "all" || t.dataset.kind === state.kind) &&
        (state.project === "all" || t.dataset.project === state.project);
      t.hidden = !ok;
      if (ok) {
        n++;
        t.classList.add("in");
      }
    });
    countEl.textContent = "Showing " + n + " of " + tiles.length;
    emptyEl.hidden = n > 0;
    document.querySelectorAll("[data-filter-kind]").forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.filterKind === state.kind),
      );
    });
    document.querySelectorAll("[data-filter-project]").forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.filterProject === state.project),
      );
    });
    if (push) {
      var h = state.project === "all" ? "" : "#" + state.project;
      history.replaceState(null, "", location.pathname + h);
    }
  }

  document.addEventListener("click", function (e) {
    var k = e.target.closest("[data-filter-kind]");
    var p = e.target.closest("[data-filter-project]");
    if (k) {
      state.kind = k.dataset.filterKind;
      apply(true);
    }
    if (p) {
      state.project = p.dataset.filterProject;
      apply(true);
    }
  });

  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var known = document.querySelector(
      '[data-filter-project="' +
        (window.CSS && CSS.escape ? CSS.escape(id) : id) +
        '"]',
    );
    state.project = id && known ? id : "all";
    apply(false);
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();

  // Hover preview: swap the poster for the muted clip while the pointer is on it.
  if (finePointer && !reduced) {
    tiles.forEach(function (t) {
      if (t.dataset.type !== "video") return;
      var box = t.querySelector(".tile-media");
      var v = null;
      t.addEventListener("pointerenter", function () {
        v = document.createElement("video");
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute("aria-hidden", "true");
        v.src = t.dataset.src;
        box.appendChild(v);
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
        t.classList.add("playing");
      });
      t.addEventListener("pointerleave", function () {
        if (v) {
          v.pause();
          v.removeAttribute("src");
          v.load();
          v.remove();
          v = null;
        }
        t.classList.remove("playing");
      });
    });
  }

  // ---------- lightbox ----------
  var lb = document.getElementById("lb");
  if (!lb || typeof lb.showModal !== "function") return; // no <dialog>: links open the file
  var stage = document.getElementById("lb-stage");
  var f = {
    n: document.getElementById("lb-n"),
    title: document.getElementById("lb-title"),
    client: document.getElementById("lb-client"),
    caption: document.getElementById("lb-caption"),
    credit: document.getElementById("lb-credit"),
  };
  var current = null,
    opener = null;

  function show(t) {
    current = t;
    stage.textContent = "";
    var el;
    if (t.dataset.type === "video") {
      el = document.createElement("video");
      el.controls = true;
      el.playsInline = true;
      el.autoplay = true;
      el.poster = t.dataset.poster;
      el.src = t.dataset.src;
    } else {
      el = document.createElement("img");
      el.src = t.dataset.src;
      el.alt = t.dataset.title;
    }
    el.width = Number(t.dataset.w);
    el.height = Number(t.dataset.h);
    stage.appendChild(el);
    var vis = visible();
    f.n.textContent = vis.indexOf(t) + 1 + " / " + vis.length;
    f.title.textContent = t.dataset.title;
    f.client.textContent = t.dataset.client;
    f.caption.textContent = t.dataset.caption;
    f.credit.textContent = t.dataset.credit;
  }
  function step(d) {
    var vis = visible();
    if (!vis.length) return;
    var i = vis.indexOf(current);
    show(vis[(i + d + vis.length) % vis.length]);
  }
  function close() {
    stage.textContent = ""; // stops any playing video
    if (lb.open) lb.close();
  }

  grid.addEventListener("click", function (e) {
    var t = e.target.closest(".tile");
    if (!t || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
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
    stage.textContent = "";
    if (opener) opener.focus();
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
  // swipe on phones
  var sx = null;
  stage.addEventListener(
    "touchstart",
    function (e) {
      sx = e.touches[0].clientX;
    },
    { passive: true },
  );
  stage.addEventListener("touchend", function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    sx = null;
  });
})();
