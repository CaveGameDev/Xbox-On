// Remove the earlier page-level header patcher if it was registered.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
      if (new URL(script, location.href).pathname.endsWith("/coop-patch.js")) registration.unregister();
    }
  }).catch(() => {});
}
