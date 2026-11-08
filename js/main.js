/* Wexen — site behaviour (plain JavaScript, no dependencies) */
(function () {
  "use strict";

  /* Footer year */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Mobile navigation */
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("primary-navigation");

  function setMenu(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });
    var brand = document.querySelector(".site-header .brand");
    if (brand) brand.addEventListener("click", function () { setMenu(false); });
    // Restoring a page from the back/forward cache should not show an open menu.
    window.addEventListener("pageshow", function () { setMenu(false); });
  }

  /* Contact form: sends the enquiry to a Google Sheet through a Google Apps Script web app.
     The web app link lives in config/google-sheet.js */
  var CONTACT_EMAIL = "adityakohli645@gmail.com";
  var form = document.querySelector(".inquiry-form");

  if (form) {
    var SCRIPT_URL = String((window.WEXEN_SHEET && window.WEXEN_SHEET.scriptUrl) || "").trim();
    var isConfigured = /^https:\/\/script\.google\.com\//.test(SCRIPT_URL) && SCRIPT_URL.indexOf("PASTE_YOUR") === -1;
    var submitButton = form.querySelector(".form-submit");
    var statusBox = form.querySelector(".form-status");
    var busy = false;
    var retryId = null; // set only after a failed send, so a retry of the same message is not saved twice

    var newId = function () {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
      return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    };

    var showStatus = function (type, message) {
      if (!statusBox) return;
      statusBox.textContent = message;
      statusBox.className = "form-status is-" + type;
      statusBox.hidden = false;
    };

    var hideStatus = function () {
      if (!statusBox) return;
      statusBox.hidden = true;
      statusBox.textContent = "";
      statusBox.className = "form-status";
    };

    var setBusy = function (state) {
      busy = state;
      if (submitButton) submitButton.disabled = state;
    };

    var post = function (payload, noCors) {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 25000) : null;
      return fetch(SCRIPT_URL, {
        method: "POST",
        mode: noCors ? "no-cors" : "cors",
        redirect: "follow",
        keepalive: true, // lets the request finish even if the visitor closes or leaves the page
        // text/plain avoids a CORS preflight, which Apps Script cannot answer
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      }).finally(function () { if (timer) clearTimeout(timer); });
    };

    var send = function (payload) {
      return post(payload, false)
        .then(function (response) { return response.json(); })
        .then(function (result) {
          if (!result || result.ok !== true) {
            var err = new Error((result && result.error) || "The message could not be saved.");
            err.fromServer = true;
            throw err;
          }
        })
        .catch(function (err) {
          if (err && err.fromServer) throw err;
          if (err && err.name === "TypeError") {
            // The browser blocked reading the reply (CORS / redirect). The request may still have arrived,
            // so send it once more in "no-cors" mode; the script ignores repeats of the same id.
            console.warn("Wexen form: reply could not be read, retrying in no-cors mode.");
            return post(payload, true);
          }
          throw err;
        });
    };

    var restoreFields = function (values) {
      Object.keys(values).forEach(function (key) {
        var field = form.elements[key];
        if (field && !field.value) field.value = values[key];
      });
    };

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;
      hideStatus();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!isConfigured) {
        console.error("Wexen form: add your Apps Script web app link in config/google-sheet.js");
        showStatus("error", "The form is not connected yet. Please email us at " + CONTACT_EMAIL + " instead.");
        return;
      }

      var data = new FormData(form);
      var values = {
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        work: String(data.get("work") || "").trim()
      };
      var id = retryId || newId();
      retryId = null;
      var payload = {
        id: id,
        name: values.name,
        email: values.email,
        work: values.work,
        hp_field: String(data.get("hp_field") || "")
      };

      // Instant feedback: confirm right away and send in the background.
      // If sending fails, the message comes back and the fields are filled in again.
      setBusy(true);
      showStatus("success", "Thank you. We have received your request and will get back to you soon.");
      var failed = false;

      send(payload).catch(function (err) {
        failed = true;
        retryId = id; // sending the same message again will not create a duplicate row
        console.error("Wexen form error:", err);
        restoreFields(values);
        showStatus("error", err && err.fromServer
          ? err.message
          : "Something went wrong and your message was not sent. Please try again, or email us at " + CONTACT_EMAIL + ".");
        setBusy(false);
      });

      // Keep the thank-you visible for 3 seconds, then reset the form.
      setTimeout(function () {
        if (failed) return;
        form.reset();
        hideStatus();
        setBusy(false);
      }, 3000);
    });
  }
})();
