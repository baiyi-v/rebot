<script setup>
import { toasts } from '../toast.js'
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" v-if="toasts.length">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="'toast--' + t.kind"
        >
          <span class="toast__icon">{{ icon(t.kind) }}</span>
          <span class="toast__text">{{ t.msg }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script>
function icon(kind) {
  if (kind === 'success') return '✅'
  if (kind === 'info') return 'ℹ️'
  return '⚠️'
}
</script>

<style scoped>
.toast-stack {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 400px;
  width: max-content;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  pointer-events: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  word-break: break-word;
}

.toast--error {
  background: #450a0a;
  color: #fecaca;
  border: 1px solid #7f1d1d;
}

.toast--success {
  background: #052e16;
  color: #bbf7d0;
  border: 1px solid #166534;
}

.toast--info {
  background: #172554;
  color: #bfdbfe;
  border: 1px solid #1e3a5f;
}

.toast__icon {
  flex-shrink: 0;
  font-size: 15px;
}

.toast__text {
  flex: 1;
}

.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 768px) {
  .toast-stack {
    left: 8px;
    right: 8px;
    transform: none;
    max-width: none;
    width: auto;
  }

  .toast {
    font-size: 14px;
    padding: 12px 16px;
  }
}
</style>
