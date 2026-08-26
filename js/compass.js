const Compass = (() => {
  let heading = null;
  let enabled = false;
  let permission = "unknown";
  let listeners = [];

  async function requestPermission() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        permission = await DeviceOrientationEvent.requestPermission();
      } catch {
        permission = "denied";
      }
    } else {
      permission = "granted";
    }
    if (permission === "granted") {
      window.addEventListener("deviceorientation", onOrientation);
    }
    return permission;
  }

  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") {
      h = e.webkitCompassHeading; // iOS
    } else if (e.absolute && e.alpha !== null && e.alpha !== undefined) {
      h = 360 - e.alpha; // Android (przyblizone)
    }
    if (h !== null && h !== undefined && isFinite(h)) {
      heading = h;
      listeners.forEach((f) => f(h));
    }
  }

  function setEnabled(v) {
    enabled = v;
    if (!enabled) heading = null;
  }

  return {
    requestPermission,
    setEnabled,
    isEnabled: () => enabled,
    getHeading: () => heading,
    onChange: (f) => listeners.push(f),
  };
})();
