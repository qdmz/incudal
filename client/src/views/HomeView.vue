<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { useConfigStore } from '@/stores/config'
import { useThemeStore } from '@/stores/theme'
import { useBrand } from '@/composables/useBrand'
import { usePageSeo } from '@/composables/usePageSeo'
import {
  formatPublicPrice,
  formatPublicTraffic,
  getStartingMonthlyPrice,
  type PublicPackage,
  type PublicRegion
} from '@/utils/publicCatalog'

defineOptions({
  name: 'HomeView'
})

const router = useRouter()
const { t } = useI18n()
const configStore = useConfigStore()
const themeStore = useThemeStore()
const brand = useBrand()
void configStore.loadPublicConfig()

const packages = ref<PublicPackage[]>([])
const regions = ref<PublicRegion[]>([])
const loading = ref(true)

const officialPackages = computed(() =>
  packages.value
    .filter(pkg => pkg.sourceType === 'official' && !pkg.soldOut)
    .sort((a, b) => {
      const pa = getStartingMonthlyPrice(a)
      const pb = getStartingMonthlyPrice(b)
      if (pa !== null && pb !== null && pa !== pb) return pa - pb
      if (pa === null && pb !== null) return 1
      if (pa !== null && pb === null) return -1
      return a.name.localeCompare(b.name, 'zh')
    })
    .slice(0, 6)
)

const statCards = computed(() => [
  { label: t('publicSite.portal.stats.packages'), value: String(packages.value.length) },
  { label: t('publicSite.portal.stats.regions'), value: String(regions.value.length) },
  { label: t('publicSite.portal.stats.official'), value: String(packages.value.filter(pkg => pkg.sourceType === 'official').length) },
  { label: t('publicSite.portal.stats.market'), value: String(packages.value.filter(pkg => pkg.sourceType === 'market').length) }
])

const featureCards = computed(() => [
  {
    title: t('publicSite.portal.experienceNoLoginTitle'),
    description: t('publicSite.portal.experienceNoLoginDescription'),
    icon: 'globe'
  },
  {
    title: t('publicSite.portal.experienceRoutingTitle'),
    description: t('publicSite.portal.experienceRoutingDescription'),
    icon: 'server'
  },
  {
    title: t('publicSite.portal.experienceThemeTitle'),
    description: t('publicSite.portal.experienceThemeDescription'),
    icon: 'tag'
  }
])

const ui = computed(() => themeStore.isDark
  ? {
      page: 'bg-[#111418]',
      heroTint: 'bg-[linear-gradient(180deg,rgba(26,44,82,0.55)_0%,rgba(26,44,82,0.25)_45%,rgba(17,20,24,0)_100%)]',
      badge: 'border-[#284777] bg-[#1a2c52] text-[#d3e3fd]',
      badgeDot: 'bg-[#a8c7fa]',
      heading: 'text-[#e3e2e6]',
      body: 'text-[#c3c6cf]',
      primaryButton: 'bg-[#a8c7fa] text-[#062e6f] shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)] hover:bg-[#bdd3fb] hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_2px_rgba(0,0,0,0.15)] focus-visible:ring-[#a8c7fa]/40',
      secondaryButton: 'bg-[#284777] text-[#d3e3fd] hover:bg-[#304f81] focus-visible:ring-[#a8c7fa]/40',
      statCard: 'border-[#43474e] bg-[#1d2024]',
      statValue: 'text-[#e3e2e6]',
      statLabel: 'text-[#8e9199]',
      featureCard: 'border-[#43474e] bg-[#1d2024]',
      featureIcon: 'text-[#a8c7fa] bg-[#1a2c52]',
      featureTitle: 'text-[#e3e2e6]',
      featureBody: 'text-[#c3c6cf]',
      sectionLabel: 'text-[#8e9199]',
      sectionHeading: 'text-[#e3e2e6]',
      sectionBody: 'text-[#c3c6cf]',
      packageCard: 'border-[#43474e] bg-[#1d2024] hover:bg-[#22252a] shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_4px_8px_3px_rgba(0,0,0,0.15)]',
      packageTitle: 'text-[#e3e2e6]',
      packageBody: 'text-[#c3c6cf]',
      chipKvm: 'border border-[#ffdfa6]/60 text-[#ffdfa6]',
      chipLxc: 'border border-[#8e9199]/60 text-[#c3c6cf]',
      priceText: 'text-[#a8c7fa]',
      trafficText: 'text-[#8e9199]',
      ctaSection: 'bg-[linear-gradient(180deg,rgba(26,44,82,0.55)_0%,rgba(17,20,24,0)_100%)]',
      ctaHeading: 'text-[#e3e2e6]',
      ctaBody: 'text-[#c3c6cf]',
      emptyState: 'border-[#43474e] bg-[#1d2024] text-[#8e9199]',
      skeleton: 'bg-[#272a2f]',
      glowOrb1: 'bg-[#284777]/40',
      glowOrb2: 'bg-[#1a2c52]/30'
    }
  : {
      page: 'bg-[#fcfcfd]',
      heroTint: 'bg-[linear-gradient(180deg,rgba(211,227,253,0.7)_0%,rgba(223,235,254,0.35)_45%,rgba(252,252,253,0)_100%)]',
      badge: 'border-[#aac7fa]/60 bg-[#d3e3fd] text-[#041e49]',
      badgeDot: 'bg-[#0b57d0]',
      heading: 'text-[#1a1b20]',
      body: 'text-[#43474e]',
      primaryButton: 'bg-[#0b57d0] text-white shadow-[0_1px_2px_rgba(11,87,208,0.3),0_1px_3px_1px_rgba(11,87,208,0.15)] hover:bg-[#0848ad] hover:shadow-[0_1px_2px_rgba(11,87,208,0.3),0_2px_6px_2px_rgba(11,87,208,0.15)] focus-visible:ring-[#0b57d0]/30',
      secondaryButton: 'bg-[#d3e3fd] text-[#041e49] hover:bg-[#c1d6fc] focus-visible:ring-[#0b57d0]/30',
      statCard: 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_1px_3px_1px_rgba(15,23,42,0.06)]',
      statValue: 'text-[#1a1b20]',
      statLabel: 'text-[#74777f]',
      featureCard: 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_1px_3px_1px_rgba(15,23,42,0.06)]',
      featureIcon: 'text-[#0b57d0] bg-[#d3e3fd]',
      featureTitle: 'text-[#1a1b20]',
      featureBody: 'text-[#43474e]',
      sectionLabel: 'text-[#74777f]',
      sectionHeading: 'text-[#1a1b20]',
      sectionBody: 'text-[#43474e]',
      packageCard: 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_1px_3px_1px_rgba(15,23,42,0.06)] hover:shadow-[0_1px_3px_rgba(15,23,42,0.1),0_4px_8px_3px_rgba(15,23,42,0.08)]',
      packageTitle: 'text-[#1a1b20]',
      packageBody: 'text-[#43474e]',
      chipKvm: 'border border-[#7a5900]/40 text-[#7a5900]',
      chipLxc: 'border border-[#74777f]/40 text-[#43474e]',
      priceText: 'text-[#0b57d0]',
      trafficText: 'text-[#74777f]',
      ctaSection: 'bg-[linear-gradient(180deg,rgba(211,227,253,0.7)_0%,rgba(252,252,253,0)_100%)]',
      ctaHeading: 'text-[#1a1b20]',
      ctaBody: 'text-[#43474e]',
      emptyState: 'border-[#c3c6cf] bg-white text-[#74777f]',
      skeleton: 'bg-[#e2e4ed]',
      glowOrb1: 'bg-[#0b57d0]/10',
      glowOrb2: 'bg-[#d3e3fd]/30'
    }
)

usePageSeo(() => ({
  title: `${brand.brandName} - ${t('publicSite.seo.homeTitle').replace(/Incudal/g, brand.brandName)}`,
  description: t('publicSite.seo.homeDescription'),
  canonical: `${window.location.origin}/`,
  keywords: t('publicSite.seo.keywords').replace(/Incudal/g, brand.brandName)
}))

function formatTraffic(bytes: string | null): string {
  return formatPublicTraffic(bytes, t('common.unlimited'))
}

function getPriceLabel(pkg: PublicPackage): string {
  const startPrice = getStartingMonthlyPrice(pkg)
  if (startPrice === null) {
    return t('publicSite.market.free')
  }
  return t('publicSite.market.fromMonthly', { price: formatPublicPrice(startPrice) })
}

function getInstanceChipClass(instanceType: string): string {
  return instanceType === 'vm' ? ui.value.chipKvm : ui.value.chipLxc
}

function browseCatalog(source?: 'official' | 'market'): void {
  void router.push({
    path: '/instances/create',
    query: source ? { source } : undefined
  })
}

function goToLogin(): void {
  void router.push('/login')
}

async function loadCatalog(): Promise<void> {
  loading.value = true
  try {
    const [packagesRes, regionsRes] = await Promise.all([
      api.packages.listPublic({ source: 'official' }),
      api.packages.getPublicRegions({ source: 'official' })
    ])
    packages.value = (packagesRes.packages || []) as unknown as PublicPackage[]
    regions.value = regionsRes.regions || []
  } catch (error) {
    console.error('Failed to load public catalog:', error)
    packages.value = []
    regions.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadCatalog()
})
</script>

<template>
  <div class="relative min-h-screen" :class="ui.page">
    <!-- Hero -->
    <section class="relative overflow-hidden px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8">
      <!-- Background glow orbs -->
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          class="animate-fade-in absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full blur-[120px]"
          :class="ui.glowOrb1"
        ></div>
        <div
          class="animate-fade-in-delayed absolute -bottom-24 -right-24 h-[400px] w-[400px] rounded-full blur-[100px]"
          :class="ui.glowOrb2"
        ></div>
      </div>

      <!-- Hero tint overlay -->
      <div class="pointer-events-none absolute inset-0" :class="ui.heroTint" aria-hidden="true"></div>

      <div class="relative mx-auto max-w-7xl">
        <div class="mx-auto max-w-3xl text-center">
          <div
            class="animate-fade-in inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
            :class="ui.badge"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="ui.badgeDot"></span>
            {{ t('publicSite.portal.badge') }}
          </div>

          <h1
            class="animate-fade-in-up mt-8 text-4xl font-normal tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
            :class="ui.heading"
          >
            {{ t('publicSite.portal.title') }}
          </h1>

          <p
            class="animate-fade-in-up-delayed mt-6 text-base leading-7 sm:text-lg sm:leading-8"
            :class="ui.body"
          >
            {{ t('publicSite.portal.description') }}
          </p>

          <div class="animate-fade-in-up-delayed-2 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              class="inline-flex h-11 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium tracking-[0.01em] transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4"
              :class="ui.primaryButton"
              @click="browseCatalog()"
            >
              <span>{{ t('publicSite.actions.browseProducts') }}</span>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5l6 6m0 0l-6 6m6-6h-15" />
              </svg>
            </button>

            <button
              class="inline-flex h-11 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4"
              :class="ui.secondaryButton"
              @click="goToLogin"
            >
              <span>{{ t('publicSite.actions.signIn') }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="relative px-4 pb-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl">
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            v-for="item in statCards"
            :key="item.label"
            class="animate-fade-in-up rounded-2xl border p-5 transition-shadow duration-150"
            :class="ui.statCard"
          >
            <div class="text-xs font-medium" :class="ui.statLabel">
              {{ item.label }}
            </div>
            <div class="mt-2 text-3xl font-normal tracking-[-0.02em]" :class="ui.statValue">
              {{ item.value }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="relative px-4 pb-20 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl">
        <div class="mx-auto max-w-2xl text-center">
          <div class="text-xs font-medium" :class="ui.sectionLabel">
            {{ t('publicSite.portal.catalogLabel') }}
          </div>
          <h2
            class="mt-4 text-3xl font-normal tracking-[-0.02em] sm:text-[2.25rem] sm:leading-[1.15]"
            :class="ui.sectionHeading"
          >
            {{ t('publicSite.portal.catalogTitle') }}
          </h2>
          <p class="mt-4 text-base leading-7" :class="ui.sectionBody">
            {{ t('publicSite.portal.catalogDescription') }}
          </p>
        </div>

        <div class="mt-12 grid gap-6 md:grid-cols-3">
          <div
            v-for="(card, index) in featureCards"
            :key="card.title"
            class="animate-fade-in-up rounded-2xl border p-7 transition-shadow duration-150"
            :class="[ui.featureCard, index === 1 ? 'md:translate-y-4' : '']"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              :class="ui.featureIcon"
            >
              <!-- Globe icon -->
              <svg v-if="card.icon === 'globe'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <!-- Server icon -->
              <svg v-else-if="card.icon === 'server'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <!-- Tag icon -->
              <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>

            <h3 class="mt-5 text-lg font-medium tracking-[-0.01em]" :class="ui.featureTitle">
              {{ card.title }}
            </h3>
            <p class="mt-3 text-sm leading-6" :class="ui.featureBody">
              {{ card.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Hot Packages -->
    <section class="relative px-4 pb-20 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="text-xs font-medium" :class="ui.sectionLabel">
              {{ t('publicSite.portal.browseLabel') }}
            </div>
            <h2
              class="mt-4 text-3xl font-normal tracking-[-0.02em] sm:text-[2.25rem] sm:leading-[1.15]"
              :class="ui.sectionHeading"
            >
              {{ t('publicSite.portal.browseTitle') }}
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-7" :class="ui.sectionBody">
              {{ t('publicSite.portal.browseDescription') }}
            </p>
          </div>

          <button
            class="inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium tracking-[0.01em] transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4"
            :class="ui.primaryButton"
            @click="browseCatalog()"
          >
            {{ t('publicSite.actions.browseProducts') }}
          </button>
        </div>

        <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Loading skeleton -->
          <template v-if="loading">
            <div
              v-for="index in 6"
              :key="index"
              class="h-44 animate-pulse rounded-2xl"
              :class="ui.skeleton"
            ></div>
          </template>

          <!-- Package cards -->
          <template v-else-if="officialPackages.length > 0">
            <button
              v-for="pkg in officialPackages"
              :key="pkg.id"
              class="group rounded-2xl border p-5 text-left transition-[background-color,box-shadow] duration-150"
              :class="ui.packageCard"
              @click="browseCatalog(pkg.sourceType)"
            >
              <div class="flex items-center gap-2">
                <span
                  class="rounded-lg px-2 py-0.5 text-[11px] font-medium tracking-[0.02em]"
                  :class="getInstanceChipClass(pkg.instance_type)"
                >
                  {{ pkg.instance_type === 'vm' ? 'KVM' : 'LXC' }}
                </span>
              </div>

              <div class="mt-4 truncate text-lg font-medium tracking-[-0.01em]" :class="ui.packageTitle">
                {{ pkg.name }}
              </div>

              <p class="mt-2 line-clamp-2 text-sm leading-5" :class="ui.packageBody">
                {{ pkg.description || t('publicSite.portal.packageFallback') }}
              </p>

              <div class="mt-4 flex items-end justify-between border-t pt-4" :class="themeStore.isDark ? 'border-[#43474e]' : 'border-[#e3e5ec]'">
                <div class="text-sm font-medium" :class="ui.priceText">
                  {{ getPriceLabel(pkg) }}
                </div>
                <div class="text-xs" :class="ui.trafficText">
                  {{ formatTraffic(pkg.monthly_traffic_limit) }}
                </div>
              </div>
            </button>
          </template>

          <!-- Empty state -->
          <div
            v-else
            class="col-span-full rounded-2xl border border-dashed px-4 py-12 text-center text-sm"
            :class="ui.emptyState"
          >
            {{ t('publicSite.portal.emptyPackages') }}
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="relative px-4 pb-24 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-7xl">
        <div
          class="relative overflow-hidden rounded-[28px] px-8 py-16 text-center sm:px-16 sm:py-20"
          :class="ui.ctaSection"
        >
          <!-- Background glow -->
          <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              class="absolute left-1/2 top-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
              :class="ui.glowOrb1"
            ></div>
          </div>

          <div class="relative">
            <h2
              class="text-3xl font-normal tracking-[-0.02em] sm:text-4xl sm:leading-[1.15]"
              :class="ui.ctaHeading"
            >
              {{ brand.brandName }}
            </h2>
            <p class="mx-auto mt-4 max-w-xl text-base leading-7 sm:text-lg sm:leading-8" :class="ui.ctaBody">
              {{ brand.brandSubtitle }}
            </p>

            <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                class="inline-flex h-11 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium tracking-[0.01em] transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4"
                :class="ui.primaryButton"
                @click="browseCatalog()"
              >
                <span>{{ t('publicSite.actions.browseProducts') }}</span>
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5l6 6m0 0l-6 6m6-6h-15" />
                </svg>
              </button>

              <button
                class="inline-flex h-11 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4"
                :class="ui.secondaryButton"
                @click="goToLogin"
              >
                <span>{{ t('publicSite.actions.signIn') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.6s ease-out both;
}

.animate-fade-in-delayed {
  animation: fade-in 0.6s ease-out 0.15s both;
}

.animate-fade-in-up {
  animation: fade-in-up 0.6s ease-out both;
}

.animate-fade-in-up-delayed {
  animation: fade-in-up 0.6s ease-out 0.1s both;
}

.animate-fade-in-up-delayed-2 {
  animation: fade-in-up 0.6s ease-out 0.2s both;
}
</style>