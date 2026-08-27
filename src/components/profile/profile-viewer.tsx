import {
  Box,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  styled,
  TextField,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { BaseDialog, Switch } from '@/components/base'
import { useProfiles } from '@/hooks/use-profiles'
import { createProfile, patchProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { FileInput } from './file-input'
import {
  CUSTOM_USER_AGENT_PRESET_ID,
  DEFAULT_USER_AGENT_PRESET_ID,
  resolveUserAgentPresetId,
  USER_AGENT_PRESETS,
  type UserAgentPresetId,
} from './user-agent-presets'

interface Props {
  onChange: (isActivating?: boolean) => void
}

export interface ProfileViewerRef {
  create: () => void
  edit: (item: IProfileItem) => void
}

type ProfileViewerProps = Props & { ref?: Ref<ProfileViewerRef> }

export function ProfileViewer({ onChange, ref }: ProfileViewerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [openType, setOpenType] = useState<'new' | 'edit'>('new')
  const [loading, setLoading] = useState(false)
  const [userAgentPresetId, setUserAgentPresetId] =
    useState<UserAgentPresetId>(DEFAULT_USER_AGENT_PRESET_ID)
  const { profiles } = useProfiles()

  const fileDataRef = useRef<string | null>(null)

  const { control, watch, setValue, reset, handleSubmit, getValues } =
    useForm<IProfileItem>({
      defaultValues: {
        type: 'remote',
        name: '',
        desc: '',
        url: '',
        option: {
          with_proxy: false,
          self_proxy: false,
          allow_auto_update: false,
        },
      },
    })

  useImperativeHandle(ref, () => ({
    create: () => {
      setUserAgentPresetId(DEFAULT_USER_AGENT_PRESET_ID)
      setValue('option.user_agent', undefined)
      setOpenType('new')
      setOpen(true)
    },
    edit: (item: IProfileItem) => {
      if (item) {
        Object.entries(item).forEach(([key, value]) => {
          setValue(key as any, value)
        })
        setUserAgentPresetId(
          resolveUserAgentPresetId(item.option?.user_agent),
        )
      }
      setOpenType('edit')
      setOpen(true)
    },
  }))

  const selfProxy = watch('option.self_proxy')
  const withProxy = watch('option.with_proxy')

  useEffect(() => {
    if (selfProxy) setValue('option.with_proxy', false)
  }, [selfProxy, setValue])

  useEffect(() => {
    if (withProxy) setValue('option.self_proxy', false)
  }, [setValue, withProxy])

  const handleOk = useLockFn(
    handleSubmit(async (form) => {
      setLoading(true)
      try {
        if (!form.type) {
          throw new Error(t('profiles.modals.profileForm.errors.typeRequired'))
        }
        if (form.type === 'remote' && !form.url) {
          throw new Error(t('profiles.modals.profileForm.errors.urlRequired'))
        }

        const option = form.option ? { ...form.option } : undefined
        if (option?.timeout_seconds) {
          option.timeout_seconds = +option.timeout_seconds
        } else if (option) {
          option.timeout_seconds = undefined
        }
        if (option?.user_agent === '') {
          option.user_agent = undefined
        }

        const name = form.name || `${form.type} file`
        const item = { ...form, name, option }
        const isRemote = form.type === 'remote'
        const isUpdate = openType === 'edit'

        const isActivating = isUpdate && form.uid === (profiles?.current ?? '')

        // Preserve proxy settings when the remote retry succeeds through another route.
        const originalOptions = {
          with_proxy: form.option?.with_proxy,
          self_proxy: form.option?.self_proxy,
        }

        if (!isRemote) {
          if (openType === 'new') {
            await createProfile(item, fileDataRef.current)
          } else {
            if (!form.uid) {
              throw new Error(
                t('profiles.modals.profileForm.errors.uidMissing'),
              )
            }
            await patchProfile(form.uid, item)
          }
        } else {
          try {
            if (openType === 'new') {
              await createProfile(item, fileDataRef.current)
            } else {
              if (!form.uid) {
                throw new Error(
                  t('profiles.modals.profileForm.errors.uidMissing'),
                )
              }
              await patchProfile(form.uid, item)
            }
          } catch {
            showNotice.info(
              'profiles.modals.profileForm.feedback.notifications.creationRetry',
            )

            const retryItem = {
              ...item,
              option: {
                ...item.option,
                with_proxy: false,
                self_proxy: true,
              },
            }

            if (openType === 'new') {
              await createProfile(retryItem, fileDataRef.current)
            } else {
              if (!form.uid) {
                throw new Error(
                  t('profiles.modals.profileForm.errors.uidMissing'),
                )
              }
              await patchProfile(form.uid, retryItem)

              await patchProfile(form.uid, { option: originalOptions })
            }

            showNotice.success(
              'profiles.modals.profileForm.feedback.notifications.creationSuccess',
            )
          }
        }

        setOpen(false)
        setUserAgentPresetId(DEFAULT_USER_AGENT_PRESET_ID)
        setTimeout(() => reset(), 500)
        fileDataRef.current = null

        setTimeout(() => {
          onChange(isActivating)
        }, 0)
      } catch (err) {
        showNotice.error('profiles.modals.profileForm.errors.saveFailed', err)
      } finally {
        setLoading(false)
      }
    }),
  )

  const handleClose = () => {
    try {
      setOpen(false)
      setUserAgentPresetId(DEFAULT_USER_AGENT_PRESET_ID)
      fileDataRef.current = null
      setTimeout(() => reset(), 500)
    } catch (e) {
      console.warn('[ProfileViewer] handleClose error:', e)
    }
  }

  const text = {
    fullWidth: true,
    size: 'small',
    margin: 'normal',
    variant: 'outlined',
    autoComplete: 'off',
    autoCorrect: 'off',
  } as const

  const formType = watch('type')
  const isRemote = formType === 'remote'
  const isLocal = formType === 'local'

  return (
    <BaseDialog
      open={open}
      title={
        openType === 'new'
          ? t('profiles.modals.profileForm.title.create')
          : t('profiles.modals.profileForm.title.edit')
      }
      contentSx={{ width: 375, pb: 0, maxHeight: '80%' }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={handleClose}
      onCancel={handleClose}
      onOk={handleOk}
      loading={loading}
    >
      <Controller
        name="type"
        control={control}
        render={({ field }) => (
          <FormControl size="small" fullWidth sx={{ mt: 1, mb: 1 }}>
            <InputLabel>
              {t('profiles.modals.profileForm.fields.type')}
            </InputLabel>
            <Select
              {...field}
              autoFocus
              label={t('profiles.modals.profileForm.fields.type')}
            >
              <MenuItem value="remote">
                {t('profiles.modals.profileForm.types.remote')}
              </MenuItem>
              <MenuItem value="local">
                {t('profiles.modals.profileForm.types.local')}
              </MenuItem>
            </Select>
          </FormControl>
        )}
      />

      <Controller
        name="name"
        control={control}
        render={({ field }) => (
          <TextField {...text} {...field} label={t('shared.labels.name')} />
        )}
      />

      <Controller
        name="desc"
        control={control}
        render={({ field }) => (
          <TextField
            {...text}
            {...field}
            label={t('profiles.modals.profileForm.fields.description')}
          />
        )}
      />

      {isLocal && openType === 'new' && (
        <FileInput
          onChange={(file, val) => {
            setValue('name', getValues('name') || file.name)
            fileDataRef.current = val
          }}
        />
      )}

      {isRemote && (
        <>
          <Controller
            name="url"
            control={control}
            render={({ field }) => (
              <TextField
                {...text}
                {...field}
                multiline
                label={t('profiles.modals.profileForm.fields.subscriptionUrl')}
              />
            )}
          />

          <FormControl size="small" fullWidth sx={{ mt: 1, mb: 1 }}>
            <InputLabel>
              {t('profiles.modals.profileForm.fields.userAgent')}
            </InputLabel>
            <Select
              value={userAgentPresetId}
              label={t('profiles.modals.profileForm.fields.userAgent')}
              onChange={(event) => {
                const presetId = event.target.value as UserAgentPresetId
                setUserAgentPresetId(presetId)

                if (presetId === CUSTOM_USER_AGENT_PRESET_ID) {
                  const currentUserAgent = getValues('option.user_agent')
                  if (
                    resolveUserAgentPresetId(currentUserAgent) !==
                    CUSTOM_USER_AGENT_PRESET_ID
                  ) {
                    setValue('option.user_agent', '')
                  }
                  return
                }

                const preset = USER_AGENT_PRESETS.find(
                  (item) => item.id === presetId,
                )
                setValue('option.user_agent', preset?.value)
              }}
            >
              {USER_AGENT_PRESETS.map((preset) => (
                <MenuItem key={preset.id} value={preset.id}>
                  {t(preset.labelKey)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {userAgentPresetId === CUSTOM_USER_AGENT_PRESET_ID && (
            <Controller
              name="option.user_agent"
              control={control}
              render={({ field }) => (
                <TextField
                  {...text}
                  {...field}
                  label={t(
                    'profiles.modals.profileForm.fields.customUserAgent',
                  )}
                />
              )}
            />
          )}

          <Controller
            name="option.timeout_seconds"
            control={control}
            render={({ field }) => (
              <TextField
                {...text}
                {...field}
                type="number"
                placeholder="60"
                label={t('profiles.modals.profileForm.fields.httpTimeout')}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        {t('shared.units.seconds')}
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
          />
          <Controller
            name="option.with_proxy"
            control={control}
            render={({ field }) => (
              <StyledBox>
                <InputLabel>
                  {t('profiles.modals.profileForm.fields.useSystemProxy')}
                </InputLabel>
                <Switch checked={field.value} {...field} color="primary" />
              </StyledBox>
            )}
          />

          <Controller
            name="option.self_proxy"
            control={control}
            render={({ field }) => (
              <StyledBox>
                <InputLabel>
                  {t('profiles.modals.profileForm.fields.useClashProxy')}
                </InputLabel>
                <Switch checked={field.value} {...field} color="primary" />
              </StyledBox>
            )}
          />

          <Controller
            name="option.danger_accept_invalid_certs"
            control={control}
            render={({ field }) => (
              <StyledBox>
                <InputLabel>
                  {t('profiles.modals.profileForm.fields.acceptInvalidCerts')}
                </InputLabel>
                <Switch checked={field.value} {...field} color="primary" />
              </StyledBox>
            )}
          />

        </>
      )}
    </BaseDialog>
  )
}

const StyledBox = styled(Box)(() => ({
  margin: '8px 0 8px 8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}))
