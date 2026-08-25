(() => {
  "use strict";

  const INSTALL_FLAG = "__NEXTGEN_DEV_WAYBILL_BRIDGE_INSTALLED__";
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const ENDPOINT = "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/add";
  const EVENT_TYPE = "NEXTGEN_JFS_WAYBILL_CREATED";
  const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

  function matchesEndpoint(url, method) {
    if (String(method).toUpperCase() !== "POST") return false;
    try {
      const candidate = new URL(url, window.location.href);
      const endpoint = new URL(ENDPOINT);
      return candidate.origin === endpoint.origin && candidate.pathname === endpoint.pathname;
    } catch {
      return false;
    }
  }

  function emitIfSuccessful(url, method, status, payload) {
    try {
      const waybillNo = typeof payload?.data?.waybillNo === "string"
        ? payload.data.waybillNo.trim()
        : "";
      if (
        matchesEndpoint(url, method) &&
        status === 200 &&
        payload?.code === 1 &&
        payload?.succ === true &&
        payload?.fail === false &&
        WAYBILL_PATTERN.test(waybillNo)
      ) {
        window.postMessage({ type: EVENT_TYPE, waybillNo }, window.location.origin);
      }
    } catch {
      // Extension inspection must never affect the JFS operation.
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function nextgenWaybillFetch(input, init) {
      const method = init?.method ?? (typeof input === "object" && input ? input.method : "GET");
      const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url ?? "";
      const fetchResult = originalFetch.apply(this, arguments);
      void fetchResult.then((response) => {
        if (!matchesEndpoint(url, method)) return;
        void response.clone().json()
          .then((payload) => emitIfSuccessful(url, method, response.status, payload))
          .catch(() => undefined);
      }).catch(() => undefined);
      return fetchResult;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const requestMetadata = new WeakMap();

    OriginalXHR.prototype.open = function nextgenWaybillOpen(method, url) {
      requestMetadata.set(this, { method, url: String(url) });
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function nextgenWaybillSend() {
      const metadata = requestMetadata.get(this);
      if (metadata && matchesEndpoint(metadata.url, metadata.method)) {
        this.addEventListener("loadend", () => {
          try {
            let payload;
            if (this.responseType === "json") payload = this.response;
            else if (!this.responseType || this.responseType === "text") payload = JSON.parse(this.responseText);
            else return;
            emitIfSuccessful(metadata.url, metadata.method, this.status, payload);
          } catch {
            // Invalid/unreadable responses are ignored without changing XHR behavior.
          }
        }, { once: true });
      }
      return originalSend.apply(this, arguments);
    };
  }
})();
