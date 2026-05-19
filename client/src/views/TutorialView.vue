<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()
const currentStep = ref(0)

const steps = [
  {
    title: '欢迎使用番茄小说下载器',
    subtitle: '让下载变得简单',
    content: '本平台提供番茄小说链接解析和批量下载功能。注册后即可开始使用。',
    image: 'https://neeko-copilot.bytedance.net/api/text_to_image?prompt=A%20friendly%20welcome%20screen%20for%20a%20book%20downloader%20app%20with%20books%20and%20download%20icons%2C%20clean%20modern%20UI%2C%20green%20and%20orange%20color%20scheme&image_size=landscape_16_9',
  },
  {
    title: '第一步：解析链接',
    subtitle: '粘贴小说链接',
    content: '在「解析下载」页面粘贴番茄小说的分享链接，系统会自动解析书籍信息。',
    image: 'https://neeko-copilot.bytedance.net/api/text_to_image?prompt=A%20web%20form%20interface%20for%20pasting%20book%20URL%2C%20with%20input%20field%20and%20parse%20button%2C%20clean%20modern%20design&image_size=landscape_16_9',
  },
  {
    title: '第二步：确认下载',
    subtitle: '选择章节范围',
    content: '解析成功后可以看到书籍详情，可以选择下载全书或指定章节范围（如 1-50）。',
    image: 'https://neeko-copilot.bytedance.net/api/text_to_image?prompt=Book%20details%20page%20showing%20title%2C%20author%2C%20cover%20image%20and%20chapter%20selection%2C%20download%20button%2C%20clean%20UI&image_size=landscape_16_9',
  },
  {
    title: '第三步：查看进度',
    subtitle: '等待下载完成',
    content: '在「任务列表」页面可以查看下载进度，支持同时处理多个任务。',
    image: 'https://neeko-copilot.bytedance.net/api/text_to_image?prompt=Download%20task%20list%20with%20progress%20bars%2C%20status%20indicators%2C%20multiple%20downloads%20running%2C%20modern%20dashboard%20style&image_size=landscape_16_9',
  },
  {
    title: '第四步：获取成品',
    subtitle: '下载电子书',
    content: '下载完成后，可以在任务列表中直接下载 EPUB/TXT 格式的电子书到本地。',
    image: 'https://neeko-copilot.bytedance.net/api/text_to_image?prompt=Download%20complete%20screen%20with%20ebook%20files%20ready%20to%20download%2C%20EPUB%20and%20TXT%20format%20options%2C%20success%20icons&image_size=landscape_16_9',
  },
]

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  } else {
    goToApp()
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function goToApp() {
  router.push('/app/tomato')
}

function skipTutorial() {
  goToApp()
}

onMounted(async () => {
  await auth.loadMe()
  if (!auth.user) {
    router.replace('/login')
  }
})
</script>

<template>
  <div class="tutorial">
    <div class="tutorial__header">
      <button
        v-if="currentStep > 0"
        type="button"
        class="btn btn--ghost tutorial__skip"
        @click="skipTutorial"
      >
        跳过教程
      </button>
      <div v-else class="tutorial__progress">
        <span class="tutorial__progress-text">
          {{ currentStep + 1 }} / {{ steps.length }}
        </span>
      </div>
    </div>

    <div class="tutorial__content">
      <img 
        v-if="steps[currentStep].image.startsWith('http')" 
        :src="steps[currentStep].image" 
        :alt="steps[currentStep].title"
        class="tutorial__image"
      />
      <div v-else class="tutorial__emoji">{{ steps[currentStep].image }}</div>
      <h1 class="tutorial__title">{{ steps[currentStep].title }}</h1>
      <p class="tutorial__subtitle">{{ steps[currentStep].subtitle }}</p>
      <p class="tutorial__desc">{{ steps[currentStep].content }}</p>
    </div>

    <div class="tutorial__nav">
      <button
        v-if="currentStep > 0"
        type="button"
        class="btn"
        @click="prevStep"
      >
        ← 上一步
      </button>
      <button
        type="button"
        class="btn btn--primary"
        @click="nextStep"
      >
        {{ currentStep < steps.length - 1 ? '下一步 →' : '开始使用' }}
      </button>
    </div>

    <div class="tutorial__dots">
      <span
        v-for="(_, index) in steps"
        :key="index"
        class="tutorial__dot"
        :class="{ 'tutorial__dot--active': index === currentStep }"
        @click="currentStep = index"
      ></span>
    </div>
  </div>
</template>

<style scoped>
.tutorial {
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 20px 48px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.tutorial__header {
  display: flex;
  justify-content: flex-end;
}

.tutorial__skip {
  font-size: 13px;
}

.tutorial__progress {
  margin-left: auto;
}

.tutorial__progress-text {
  font-size: 12px;
  color: var(--text-dim);
}

.tutorial__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.tutorial__image {
  max-width: 100%;
  height: auto;
  max-height: 280px;
  border-radius: 12px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.tutorial__emoji {
  font-size: 80px;
  margin-bottom: 24px;
}

.tutorial__title {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 700;
}

.tutorial__subtitle {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-dim);
}

.tutorial__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-dim);
  max-width: 400px;
}

.tutorial__nav {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 32px;
}

.tutorial__dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
}

.tutorial__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.tutorial__dot--active {
  background: #fb923c;
}
</style>