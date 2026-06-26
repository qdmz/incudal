<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

import api from '@/api'

const props = defineProps<{
  visible: boolean
  instanceId: number | null
  instanceName?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

const { t } = useI18n()
const authStore = useAuthStore()


const vncContainer = ref<HTMLDivElement | null>(null)
const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
const errorMessage = ref<string>('')
const isFullscreen = ref(false)

let rfb: any = null


function buildVncWebSocketUrl(instanceId: number, ticket: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}/api/ws/instances/${instanceId}/vnc?ticket=${encodeURIComponent(ticket)}`
}

async function connect() {
  if (!props.instanceId || !vncContainer.value) return

  status.value = 'connecting'
  errorMessage.value = ''

  try {
    const token = authStore.token
    if (!token) {
      errorMessage.value = t('vnc.notAuthenticated')
      status.value = 'error'
      return
    }

    const ticketResponse = await api.instances.createVncTicket(props.instanceId)
    const wsUrl = buildVncWebSocketUrl(props.instanceId, ticketResponse.ticket)

    const RFB = (await import('@novnc/novnc/lib/rfb.js')).default

    rfb = new RFB(vncContainer.value, wsUrl, {
      wsProtocols: ['binary'],
      shared: true,
    })

    rfb.addEventListener('connect', () => {
      status.value = 'connected'
      console.log('[VNC] Connected')
    })

    rfb.addEventListener('disconnect', (e: any) => {
      const clean = e.detail?.clean
      if (clean) {
        status.value = 'disconnected'
      } else {
        errorMessage.value = t('vnc.connectionLost')
        status.value = 'error'
      }
      rfb = null
    })

    rfb.addEventListener('credentialsrequired', () => {
      rfb.sendCredentials({ password: '' })
    })

    rfb.addEventListener('desktopname', (e: any) => {
      console.log('[VNC] Desktop name:', e.detail.name)
    })

    rfb.scaleViewport = true
    rfb.resizeSession = false

  } catch (err: any) {
    console.error('[VNC] Connection failed:', err)
    errorMessage.value = err.message || t('vnc.connectionFailed')
    status.value = 'error'
  }
}

function disconnect() {
  if (rfb) {
    rfb.disconnect()
    rfb = null
  }
  status.value = 'disconnected'
  errorMessage.value = ''
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    if (rfb) {
      rfb.scaleViewport = true
    }
  })
}

function sendCtrlAltDel() {
  if (rfb) {
    rfb.sendCtrlAltDel()
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => connect())
  } else {
    disconnect()
  }
})

onUnmounted(() => {
  disconnect()
})

function handleClose() {
  disconnect()
  emit('update:visible', false)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="fixed inset-0 z-[9999] flex items-center justify-center"
        :class="{ 'p-4': !isFullscreen }"
      >
        <div class="absolute inset-0 bg-black/60" @click="handleClose" />

        <div
          class="relative flex flex-col bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
          :class="isFullscreen ? 'fixed inset-0 z-[10000] rounded-none' : 'w-[90vw] max-w-5xl h-[80vh] rounded-xl'"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span class="font-medium text-gray-900 dark:text-gray-100">
                VNC {{ instanceName ? `- ${instanceName}` : '' }}
              </span>
              <span
                v-if="status === 'connected'"
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              >
                {{ $t('vnc.connected') }}
              </span>
              <span
                v-else-if="status === 'connecting'"
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
              >
                {{ $t('vnc.connecting') }}
              </span>
              <span
                v-else-if="status === 'error'"
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              >
                {{ $t('vnc.error') }}
              </span>
            </div>

            <div class="flex items-center gap-1">
              <button
                v-if="status === 'connected'"
                class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                :title="$t('vnc.sendCtrlAltDel')"
                @click="sendCtrlAltDel"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
              <button
                class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                :title="isFullscreen ? $t('vnc.exitFullscreen') : $t('vnc.fullscreen')"
                @click="toggleFullscreen"
              >
                <svg v-if="!isFullscreen" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              </button>
              <button
                v-if="status === 'error' || status === 'disconnected'"
                class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                :title="$t('vnc.reconnect')"
                @click="disconnect(); connect()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                :title="$t('common.close')"
                @click="handleClose"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- VNC Display -->
          <div class="flex-1 relative overflow-hidden bg-black">
            <div ref="vncContainer" class="w-full h-full" />

            <!-- Connecting overlay -->
            <div
              v-if="status === 'connecting'"
              class="absolute inset-0 flex items-center justify-center bg-black/80"
            >
              <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span class="text-white text-sm">{{ $t('vnc.connecting') }}</span>
              </div>
            </div>

            <!-- Error overlay -->
            <div
              v-if="status === 'error' && errorMessage"
              class="absolute inset-0 flex items-center justify-center bg-black/80"
            >
              <div class="flex flex-col items-center gap-3 max-w-sm text-center px-4">
                <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-red-300 text-sm">{{ errorMessage }}</span>
                <button
                  class="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  @click="disconnect(); connect()"
                >
                  {{ $t('vnc.reconnect') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
:deep(div canvas) {
  cursor: default;
}
</style>