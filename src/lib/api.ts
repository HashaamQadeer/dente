export function isElectronShell() {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

export function isDenteApiAvailable() {
  return typeof window !== 'undefined' && !!window.dente
}

export function getDenteApiUnavailableMessage() {
  if (!isElectronShell()) {
    return 'Dente must run in the desktop app, not a web browser. Close this browser tab and open the Dente window from the Start menu or run npm run dev from the dente folder.'
  }
  return 'Dente could not connect to its local database. Close the app completely and open it again.'
}

export function getDenteApi() {
  if (!window.dente) {
    throw new Error(getDenteApiUnavailableMessage())
  }
  return window.dente
}
