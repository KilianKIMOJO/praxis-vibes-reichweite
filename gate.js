/* Passwortabfrage. Die öffentliche Seite enthält nur window.PV_ENC (AES-GCM, Schlüssel per
   PBKDF2-SHA256 aus dem Passwort). Erst nach richtiger Eingabe werden die Daten entschlüsselt.
   Lokal (unverschlüsselte data.js mit window.PV_DATA) wird die Abfrage übersprungen. */
(function () {
  "use strict";
  const gate = document.getElementById("gate");
  const form = document.getElementById("gate-form");
  const input = document.getElementById("pw");
  const btn = document.getElementById("gate-btn");
  const err = document.getElementById("gate-err");
  const KEY = "pv-pw";

  if (window.PV_DATA) { window.PV_START(window.PV_DATA); return; }
  const E = window.PV_ENC;
  if (!E) { document.body.innerHTML = "<p style='padding:24px'>Keine Daten gefunden.</p>"; return; }
  if (!(window.crypto && crypto.subtle)) {
    gate.hidden = false; err.textContent = "Dieser Browser unterstützt die Entschlüsselung nicht. Bitte einen aktuellen Browser verwenden."; return;
  }

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(pw) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64(E.salt), iterations: E.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(E.iv) }, key, b64(E.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function tryOpen(pw, remember) {
    try {
      const data = await decrypt(pw);
      if (remember) { try { sessionStorage.setItem(KEY, pw); } catch (e) { /* ohne Speicher */ } }
      gate.hidden = true;
      window.PV_START(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Innerhalb desselben Tabs nicht erneut fragen
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) { /* ohne Speicher */ }
  (saved ? tryOpen(saved, false) : Promise.resolve(false)).then((ok) => {
    if (ok) return;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* egal */ }
    gate.hidden = false;
    input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = ""; btn.disabled = true; btn.textContent = "Wird geöffnet …";
    const ok = await tryOpen(input.value, true);
    btn.disabled = false; btn.textContent = "Öffnen";
    if (!ok) { err.textContent = "Das Passwort stimmt nicht."; input.select(); }
  });
})();
