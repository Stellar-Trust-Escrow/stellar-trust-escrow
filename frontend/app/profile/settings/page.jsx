'use client';

import { usePreferences } from '../../../contexts/PreferencesContext';
import { useTheme } from '../../../contexts/ThemeContext';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
];

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-800">
      <div>
        <p className="text-white font-medium text-sm">{label}</p>
        {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
          checked ? 'bg-indigo-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-gray-900 rounded-xl p-6 space-y-1">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { prefs, setTheme, setLanguage, setDensity, setNotifications } = usePreferences();
  const { theme: legacyTheme, toggleTheme } = useTheme();

  function handleThemeChange(value) {
    setTheme(value);
    // Keep ThemeContext in sync for components that use useTheme()
    if (value === 'dark' && legacyTheme !== 'dark') toggleTheme();
    if (value === 'light' && legacyTheme !== 'light') toggleTheme();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1 text-sm">Manage your display and notification preferences.</p>
      </div>

      <Section title="Appearance">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Theme</label>
            <div className="flex gap-3">
              {['light', 'dark', 'system'].map((t) => (
                <button
                  key={t}
                  onClick={() => handleThemeChange(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    prefs.theme === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  aria-pressed={prefs.theme === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Display Density</label>
            <div className="flex gap-3">
              {['compact', 'comfortable'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    prefs.density === d
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  aria-pressed={prefs.density === d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Language">
        <div>
          <label htmlFor="language-select" className="block text-sm font-medium text-gray-300 mb-2">
            Display Language
          </label>
          <select
            id="language-select"
            value={prefs.language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Notifications">
        <ToggleRow
          label="Email Notifications"
          description="Receive important updates via email"
          checked={prefs.notifications.email}
          onChange={(v) => setNotifications({ email: v })}
        />
        <ToggleRow
          label="Push Notifications"
          description="Browser push notifications for real-time alerts"
          checked={prefs.notifications.push}
          onChange={(v) => setNotifications({ push: v })}
        />
        <ToggleRow
          label="In-App Notifications"
          description="Show notifications within the app"
          checked={prefs.notifications.inApp}
          onChange={(v) => setNotifications({ inApp: v })}
        />
      </Section>

      <p className="text-xs text-gray-600 text-center">
        Preferences are saved automatically and applied without a page reload.
      </p>
    </div>
  );
}
