export const LOBBY_REMINDER_SETTINGS_EVENT = 'oi:open-lobby-reminder-settings';

export function openLobbyReminderSettings() {
  window.dispatchEvent(new Event(LOBBY_REMINDER_SETTINGS_EVENT));
}
