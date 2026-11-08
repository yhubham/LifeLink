import { create } from 'zustand'

// Draft incident being reported through the SOS flow (geolocation + forms).
export const useReportStore = create((set) => ({
  latitude: null,
  longitude: null,
  address: '',
  setLocation: (latitude, longitude, address = '') =>
    set({ latitude, longitude, address }),
  reset: () => set({ latitude: null, longitude: null, address: '' }),
}))
