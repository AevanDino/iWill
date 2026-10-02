export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export function sendNotification(title: string, body?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: 'iwill-timer' })
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
