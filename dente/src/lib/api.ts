export function getDenteApi() {
  if (!window.dente) {
    throw new Error('Dente API not available. Please run inside the Electron app.')
  }
  return window.dente
}

