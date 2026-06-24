<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'
import { useBrand } from '@/composables/useBrand'
import api from '@/api'

defineOptions({ name: 'AnnouncementsView' })

const { t } = useI18n()
const themeStore = useThemeStore()
const brand = useBrand()

interface Announcement {
  id: number
  title: string
  content: string
  pinned: boolean
  createdAt: string
  updatedAt?: string
}

const announcements = ref<Announcement[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api.announcements.listPublic()
    announcements.value = res.items || []
  } catch {
    announcements.value = []
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <div class="py-8">
    <div class="mb-12 text-center">
      <h1
        class="text-3xl font-bold tracking-tight sm:text-4xl"
        :class="themeStore.isDark ? 'text-white' : 'text-slate-900'"
      >
        {{ t('publicSite.nav.help') === '帮助中心' ? '公告中心' : 'Announcements' }}
      </h1>
      <p
        class="mt-3 text-base"
        :class="themeStore.isDark ? 'text-zinc-400' : 'text-slate-500'"
      >
        {{ brand.brandName }} 最新动态与通知
      </p>
    </div>

    <div v-if="loading" class="space-y-6">
      <div
        v-for="i in 3"
        :key="i"
        class="animate-pulse rounded-2xl border p-6"
        :class="themeStore.isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'"
      >
        <div class="h-5 w-2/3 rounded" :class="themeStore.isDark ? 'bg-white/10' : 'bg-slate-200'" />
        <div class="mt-4 h-4 w-full rounded" :class="themeStore.isDark ? 'bg-white/5' : 'bg-slate-100'" />
        <div class="mt-2 h-4 w-4/5 rounded" :class="themeStore.isDark ? 'bg-white/5' : 'bg-slate-100'" />
      </div>
    </div>

    <div v-else-if="announcements.length === 0" class="text-center py-20">
      <p :class="themeStore.isDark ? 'text-zinc-500' : 'text-slate-400'">暂无公告</p>
    </div>

    <div v-else class="space-y-6">
      <article
        v-for="item in announcements"
        :key="item.id"
        class="rounded-2xl border p-6 transition-shadow hover:shadow-md"
        :class="themeStore.isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]' : 'border-slate-200 bg-white hover:bg-slate-50'"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <span
              v-if="item.pinned"
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="themeStore.isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'"
            >
              📌 置顶
            </span>
            <h2
              class="text-lg font-semibold"
              :class="themeStore.isDark ? 'text-white' : 'text-slate-900'"
            >
              {{ item.title }}
            </h2>
          </div>
          <time
            class="shrink-0 text-xs"
            :class="themeStore.isDark ? 'text-zinc-500' : 'text-slate-400'"
            :datetime="item.createdAt"
          >
            {{ formatDate(item.createdAt) }}
          </time>
        </div>
        <div
          class="prose mt-4 max-w-none text-sm leading-7"
          :class="themeStore.isDark ? 'prose-invert text-zinc-300' : 'text-slate-600'"
          v-html="item.content"
        />
      </article>
    </div>
  </div>
</template>