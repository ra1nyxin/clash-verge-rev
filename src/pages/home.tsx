import {
  DnsOutlined,
  HelpOutlineRounded,
  HistoryEduOutlined,
  RouterOutlined,
  SettingsOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Skeleton,
  Tooltip,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/base'
import { ClashModeCard } from '@/components/home/clash-mode-card'
import { CurrentProxyCard } from '@/components/home/current-proxy-card'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { HomeProfileCard } from '@/components/home/home-profile-card'
import { ProxyTunCard } from '@/components/home/proxy-tun-card'
import { useProfiles } from '@/hooks/use-profiles'
import { useVerge } from '@/hooks/use-verge'
import { entry_lightweight_mode } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { openExternalUrl } from '@/utils/open-external-url'

const preloadTestCard = () =>
  import('@/components/home/test-card').then((module) => ({
    default: module.TestCard,
  }))
const preloadClashInfoCard = () =>
  import('@/components/home/clash-info-card').then((module) => ({
    default: module.ClashInfoCard,
  }))
const LazyTestCard = lazy(preloadTestCard)
const LazyClashInfoCard = lazy(preloadClashInfoCard)

// Used by bootstrap to initiate optional card imports without blocking render.
// eslint-disable-next-line react-refresh/only-export-components
export const preloadHomePageCards = () =>
  Promise.all([
    preloadTestCard().catch(() => {}),
    preloadClashInfoCard().catch(() => {}),
  ])

// 定义首页卡片设置接口
interface HomeCardsSettings {
  profile: boolean
  proxy: boolean
  network: boolean
  mode: boolean
  info: boolean
  clashinfo: boolean
  test: boolean
  [key: string]: boolean
}

const DEFAULT_HOME_CARDS: HomeCardsSettings = {
  info: false,
  profile: true,
  proxy: true,
  network: true,
  mode: true,
  clashinfo: true,
  test: true,
}

const serializeCardFlags = (cards: HomeCardsSettings) =>
  Object.keys(cards)
    .sort()
    .map((key) => `${key}:${cards[key] ? 1 : 0}`)
    .join('|')

// 首页设置对话框组件接口
interface HomeSettingsDialogProps {
  onClose: () => void
  homeCards: HomeCardsSettings
}

// 首页设置对话框组件
const HomeSettingsDialog = ({
  onClose,
  homeCards,
}: HomeSettingsDialogProps) => {
  const { t } = useTranslation()
  const [cards, setCards] = useState<HomeCardsSettings>(homeCards)
  const { patchVerge } = useVerge()

  const handleToggle = (key: string) => {
    setCards((prev: HomeCardsSettings) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = async () => {
    await patchVerge({ home_cards: cards })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('home.page.settings.title')}</DialogTitle>
      <DialogContent>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.profile || false}
                onChange={() => handleToggle('profile')}
              />
            }
            label={t('home.page.settings.cards.profile')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.proxy || false}
                onChange={() => handleToggle('proxy')}
              />
            }
            label={t('home.page.settings.cards.currentProxy')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.network || false}
                onChange={() => handleToggle('network')}
              />
            }
            label={t('home.page.settings.cards.network')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.mode || false}
                onChange={() => handleToggle('mode')}
              />
            }
            label={t('home.page.settings.cards.proxyMode')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.test || false}
                onChange={() => handleToggle('test')}
              />
            }
            label={t('home.page.settings.cards.tests')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={cards.clashinfo || false}
                onChange={() => handleToggle('clashinfo')}
              />
            }
            label={t('home.page.settings.cards.clashInfo')}
          />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.actions.cancel')}</Button>
        <Button onClick={handleSave} color="primary">
          {t('shared.actions.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const HomePage = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { current, mutateProfiles } = useProfiles()

  // 设置弹窗的状态
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 卡片显示状态
  const homeCards =
    (verge?.home_cards as HomeCardsSettings | undefined) ?? DEFAULT_HOME_CARDS

  // 文档链接函数
  const toGithubDoc = useLockFn(() =>
    openExternalUrl('https://clash-verge-rev.github.io/index.html').catch(
      showNotice.error,
    ),
  )

  // 新增：打开设置弹窗
  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const renderCard = useCallback(
    (cardKey: string, component: React.ReactNode, size: number = 6) => {
      if (!homeCards[cardKey]) return null

      return (
        <Grid size={size} key={cardKey}>
          {component}
        </Grid>
      )
    },
    [homeCards],
  )

  const criticalCards = useMemo(
    () => [
      renderCard(
        'profile',
        <HomeProfileCard current={current} onProfileUpdated={mutateProfiles} />,
      ),
      renderCard('proxy', <CurrentProxyCard />),
      renderCard('network', <NetworkSettingsCard />),
      renderCard('mode', <ClashModeEnhancedCard />),
    ],
    [current, mutateProfiles, renderCard],
  )

  const nonCriticalCards = useMemo(
    () => [
      renderCard(
        'test',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazyTestCard />
        </Suspense>,
      ),
      renderCard(
        'clashinfo',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazyClashInfoCard />
        </Suspense>,
      ),
    ],
    [renderCard],
  )
  return (
    <BasePage
      title={t('home.page.title')}
      contentStyle={{ padding: 2 }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('home.page.tooltips.lightweightMode')} arrow>
            <IconButton
              onClick={async () => await entry_lightweight_mode()}
              size="small"
              color="inherit"
            >
              <HistoryEduOutlined />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('home.page.tooltips.manual')} arrow>
            <IconButton onClick={toGithubDoc} size="small" color="inherit">
              <HelpOutlineRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('home.page.tooltips.settings')} arrow>
            <IconButton onClick={openSettings} size="small" color="inherit">
              <SettingsOutlined />
            </IconButton>
          </Tooltip>
        </Box>
      }
    >
      <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
        {criticalCards}

        {nonCriticalCards}
      </Grid>

      {/* 首页设置弹窗 */}
      {settingsOpen && (
        <HomeSettingsDialog
          key={serializeCardFlags(homeCards)}
          onClose={() => setSettingsOpen(false)}
          homeCards={homeCards}
        />
      )}
    </BasePage>
  )
}

// 增强版网络设置卡片组件
const NetworkSettingsCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.networkSettings')}
      icon={<DnsOutlined />}
      iconColor="primary"
      action={null}
    >
      <ProxyTunCard />
    </EnhancedCard>
  )
}

// 增强版 Clash 模式卡片组件
const ClashModeEnhancedCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.proxyMode')}
      icon={<RouterOutlined />}
      iconColor="info"
      action={null}
    >
      <ClashModeCard />
    </EnhancedCard>
  )
}

export default HomePage
