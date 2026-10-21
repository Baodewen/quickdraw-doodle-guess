<script setup>
import { reactive, ref } from 'vue'
import { useIdentity } from '../composables/useIdentity.js'

const { identity, saveIdentity } = useIdentity()
const editing = ref(false)
const saved = ref(false)
const draft = reactive({ studentId: '', name: '' })

function toggleEditor() {
  editing.value = !editing.value
  saved.value = false

  if (editing.value) {
    draft.studentId = identity.studentId
    draft.name = identity.name
  }
}

function save() {
  saveIdentity({ studentId: draft.studentId, name: draft.name })
  editing.value = false
  saved.value = true
}
</script>

<template>
  <section class="identity-card" aria-label="学生身份信息">
    <span class="identity-corner c1" aria-hidden="true"></span><span class="identity-corner c2" aria-hidden="true"></span>
    <span class="identity-corner c3" aria-hidden="true"></span><span class="identity-corner c4" aria-hidden="true"></span>
    <div class="identity-heading">
      <span class="identity-exlibris">Ex Libris</span>
      <span class="identity-title">身份信息</span>
      <button
        type="button"
        class="identity-edit button button-quiet"
        :aria-expanded="editing"
        aria-controls="identity-form"
        @click="toggleEditor"
      >
        {{ editing ? '收起' : '编辑' }}
      </button>
    </div>

    <dl class="identity-values">
      <div>
        <dt>学号 <em>No.</em></dt>
        <dd :class="{ 'is-placeholder': !identity.studentId }">{{ identity.studentId || '学号未填写' }}</dd>
      </div>
      <div>
        <dt>姓名 <em>Nomen</em></dt>
        <dd :class="{ 'is-placeholder': !identity.name }">{{ identity.name || '姓名未填写' }}</dd>
      </div>
    </dl>

    <Transition name="drape">
      <form v-if="editing" id="identity-form" class="identity-form" @submit.prevent="save">
        <div class="identity-field">
          <label for="identity-student-id">学号</label>
          <input id="identity-student-id" v-model="draft.studentId" name="studentId" type="text" placeholder="请输入学号" />
        </div>
        <div class="identity-field">
          <label for="identity-name">姓名</label>
          <input id="identity-name" v-model="draft.name" name="name" type="text" autocomplete="name" placeholder="请输入姓名" />
        </div>
        <div class="identity-actions">
          <button type="submit" class="button button-primary">保存身份</button>
          <button type="button" class="button button-quiet" @click="editing = false">取消</button>
        </div>
      </form>
    </Transition>

    <Transition name="fade"><p v-if="saved" class="identity-save-note" role="status">身份信息已保存到本机。</p></Transition>
  </section>
</template>
