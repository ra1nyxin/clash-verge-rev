import type { TranslationKey } from '@/types/generated/i18n-keys'

export const DEFAULT_USER_AGENT_PRESET_ID = 'default'
export const CUSTOM_USER_AGENT_PRESET_ID = 'custom'

export const USER_AGENT_PRESETS = [
  {
    id: DEFAULT_USER_AGENT_PRESET_ID,
    labelKey: 'profiles.modals.profileForm.userAgents.default',
    value: undefined,
  },
  {
    id: 'generic',
    labelKey: 'profiles.modals.profileForm.userAgents.generic',
    value: 'Mozilla/5.0',
  },
  {
    id: 'windows-chrome',
    labelKey: 'profiles.modals.profileForm.userAgents.windowsChrome',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    id: 'windows-edge',
    labelKey: 'profiles.modals.profileForm.userAgents.windowsEdge',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  },
  {
    id: 'macos-safari',
    labelKey: 'profiles.modals.profileForm.userAgents.macosSafari',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  },
  {
    id: 'linux-firefox',
    labelKey: 'profiles.modals.profileForm.userAgents.linuxFirefox',
    value:
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  },
  {
    id: 'android-chrome',
    labelKey: 'profiles.modals.profileForm.userAgents.androidChrome',
    value:
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'iphone-safari',
    labelKey: 'profiles.modals.profileForm.userAgents.iphoneSafari',
    value:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'curl',
    labelKey: 'profiles.modals.profileForm.userAgents.curl',
    value: 'curl/8.11.0',
  },
  {
    id: CUSTOM_USER_AGENT_PRESET_ID,
    labelKey: 'profiles.modals.profileForm.userAgents.custom',
    value: undefined,
  },
] as const satisfies ReadonlyArray<{
  id: string
  labelKey: TranslationKey
  value?: string
}>

export type UserAgentPresetId = (typeof USER_AGENT_PRESETS)[number]['id']

export function resolveUserAgentPresetId(
  userAgent?: string,
): UserAgentPresetId {
  if (!userAgent) return DEFAULT_USER_AGENT_PRESET_ID

  return (
    USER_AGENT_PRESETS.find((preset) => preset.value === userAgent)?.id ??
    CUSTOM_USER_AGENT_PRESET_ID
  )
}
