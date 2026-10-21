const API_BASE = '/api'

const classNames = {
  apple: '苹果',
  banana: '香蕉',
  bicycle: '自行车',
  bird: '小鸟',
  book: '书本',
  bus: '公交车',
  car: '汽车',
  cat: '小猫',
  cloud: '云朵',
  fish: '小鱼',
  house: '房子',
  key: '钥匙',
  lightning: '闪电',
  moon: '月亮',
  mushroom: '蘑菇',
  star: '星星',
  sun: '太阳',
  tree: '树木',
  umbrella: '雨伞',
  clock: '时钟',
}

export const CLASS_LABELS = Object.keys(classNames)

export function labelName(label) {
  return classNames[label] || label
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail)
  return data
}

export function getHealth(signal) {
  return request('/health', { signal })
}

export function getClasses(signal) {
  return request('/classes', { signal })
}

export function predict(image_b64, signal) {
  return request('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64, top_k: 5 }),
    signal,
  })
}
