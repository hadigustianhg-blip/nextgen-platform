(() => {
  "use strict";

  const INSTALL_FLAG = "__NEXTGEN_DEV_WAYBILL_CONTENT_INSTALLED__";
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const EVENT_TYPE = "NEXTGEN_JFS_WAYBILL_CREATED";
  const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      message.type !== EVENT_TYPE ||
      typeof message.waybillNo !== "string" ||
      !WAYBILL_PATTERN.test(message.waybillNo) ||
      !Object.keys(message).every((key) => key === "type" || key === "waybillNo")
    ) return;

    void chrome.runtime.sendMessage({ type: EVENT_TYPE, waybillNo: message.waybillNo });
  });
})();
