import {
  RestartAltRounded,
  SwitchAccessShortcutRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { restartCore, upgradeClashCore } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

export function ClashCoreViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()

  const [open, setOpen] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const onRestart = useLockFn(async () => {
    try {
      setRestarting(true)
      await restartCore()
      showNotice.success(
        t('settings.feedback.notifications.clash.restartSuccess'),
      )
      setRestarting(false)
    } catch (err) {
      setRestarting(false)
      showNotice.error(err)
    }
  })

  const onUpgrade = useLockFn(async () => {
    try {
      setUpgrading(true)
      const report = await upgradeClashCore()
      showNotice.success(
        report.upgraded
          ? t('settings.feedback.notifications.clash.versionUpdated')
          : t('settings.feedback.notifications.clash.alreadyLatestVersion'),
      )
    } catch (err) {
      showNotice.error(err)
    } finally {
      setUpgrading(false)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {t('settings.sections.clash.form.fields.clashCore')}
          <Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<SwitchAccessShortcutRounded />}
              loadingPosition="start"
              loading={upgrading}
              disabled={restarting}
              sx={{ marginRight: '8px' }}
              onClick={onUpgrade}
            >
              {t('shared.actions.upgrade')}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<RestartAltRounded />}
              loadingPosition="start"
              loading={restarting}
              disabled={upgrading}
              onClick={onRestart}
            >
              {t('shared.actions.restart')}
            </Button>
          </Box>
        </Box>
      }
      contentSx={{
        pb: 0,
        width: 400,
        height: 180,
        overflowY: 'auto',
        userSelect: 'text',
        marginTop: '-8px',
      }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <List component="nav">
        <ListItem>
          <ListItemText primary="Mihomo" secondary="/verge-mihomo" />
          <Chip
            label={t('settings.modals.clashCore.variants.release')}
            size="small"
          />
        </ListItem>
      </List>
    </BaseDialog>
  )
}
