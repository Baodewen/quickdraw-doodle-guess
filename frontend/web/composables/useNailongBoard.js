import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { NAILONG_EYE_HITS, NAILONG_MEDIA } from '../lib/nailongArt.js'

// Shared across mounts so playing the easter egg again does not repeat four
// HEAD probes. A null result is cached too; the assets are build-time files.
let sharedMediaProbe = null

export function useNailongBoard() {
  const phase = ref('idle')
  const outlinePrepared = ref(false)
  const regionDone = reactive({ left: false, right: false })
  const media = ref(null)
  const mediaReady = ref(false)
  const mediaFailed = ref(false)
  const mediaPlaybackKey = ref(0)
  const playbackRequested = ref(false)
  const stillFailed = ref(false)
  const nag = ref(false)
  const artEl = ref(null)
  const videoEl = ref(null)

  const motionQuery = typeof window === 'undefined'
    ? null
    : window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reducedMotion = ref(motionQuery?.matches ?? false)

  function onMotionChange(event) {
    reducedMotion.value = event.matches
  }

  if (motionQuery?.addEventListener) {
    motionQuery.addEventListener('change', onMotionChange)
  } else {
    motionQuery?.addListener?.(onMotionChange)
  }

  let animations = []
  let outlineTimer = null
  let wakeTimer = null
  let nagTimer = null
  let mediaTimer = null
  let generation = 0
  let outlineRun = 0
  let invalidStrokeCount = 0

  const eyeGuideVisible = computed(() => ['waiting', 'waking'].includes(phase.value))
  const totalEyes = computed(() => Number(regionDone.left) + Number(regionDone.right))
  const mediaKind = computed(() => media.value?.kind || 'still')
  const showMediaLayer = computed(() => phase.value === 'alive')
  const canPlayMedia = computed(() => (
    phase.value === 'alive' && Boolean(media.value) && !playbackRequested.value
  ))
  const isMediaReady = computed(() => mediaReady.value && !mediaFailed.value)
  const fallbackBroken = computed(() => (
    phase.value === 'alive' && stillFailed.value && !isMediaReady.value
  ))

  const statusText = computed(() => {
    if (phase.value === 'intro') return '奶龙正在成形…'
    if (phase.value === 'waking') return '两只眼睛都亮了，奶龙要醒了！'
    if (phase.value === 'alive') return '奶龙活过来啦！'
    if (totalEyes.value >= 2) return '奶龙要醒了！'
    if (totalEyes.value === 1) return '还差一只眼睛'
    return '轮到你了：给奶龙点上两只眼睛'
  })

  const hint = computed(() => {
    if (phase.value === 'intro') {
      return '先看它慢慢成形；等不及可点「一键成形」，或直接在画板上落笔跳过描边。'
    }
    if (phase.value === 'waking') return '别眨眼，奶龙正在醒来。'
    if (phase.value === 'alive') {
      if (reducedMotion.value && media.value && !playbackRequested.value) {
        return '系统开启了减少动态效果，动画先停在这里；点「播放动画」再看。'
      }
      if (media.value) return '彩蛋已解锁。可以再看一次，或者退出回到你原来的画。'
      if (stillFailed.value) return '静帧没有加载出来，先看看奶龙呼吸的轮廓。'
      return '动图还在路上，先让静帧和你打招呼。退出后可以随时再来。'
    }
    if (nag.value) return '在两只眼睛的虚线圈里各点一下，奶龙就会醒来。'
    if (totalEyes.value === 1) return '再点另一只眼睛，两只都亮起来。'
    return '在两只眼睛的虚线圈里各点一下（用画笔点一下也算）。'
  })

  function clearTimer(name) {
    if (name === 'outline' && outlineTimer) {
      clearTimeout(outlineTimer)
      outlineTimer = null
    } else if (name === 'wake' && wakeTimer) {
      clearTimeout(wakeTimer)
      wakeTimer = null
    } else if (name === 'nag' && nagTimer) {
      clearTimeout(nagTimer)
      nagTimer = null
    } else if (name === 'media' && mediaTimer) {
      clearTimeout(mediaTimer)
      mediaTimer = null
    }
  }

  function clearTimers() {
    clearTimer('outline')
    clearTimer('wake')
    clearTimer('nag')
    clearTimer('media')
  }

  function cancelOutlineRun() {
    clearTimer('outline')
    outlineRun++
    for (const animation of animations) {
      try {
        animation.cancel()
      } catch {
        // The browser may already have cancelled it.
      }
    }
    animations = []
  }

  function setOutlineComplete() {
    const paths = artEl.value ? [...artEl.value.querySelectorAll('path')] : []
    for (const path of paths) {
      path.style.strokeDasharray = 'none'
      path.style.strokeDashoffset = '0'
    }
  }

  function startNagTimer() {
    clearTimer('nag')
    nagTimer = setTimeout(() => {
      if (phase.value === 'waiting' && totalEyes.value < 2) nag.value = true
    }, 10000)
  }

  function finishOutline() {
    if (phase.value !== 'intro') return
    cancelOutlineRun()
    setOutlineComplete()
    outlinePrepared.value = true
    phase.value = 'waiting'
    startNagTimer()
  }

  function waitForLayout() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  async function startOutline() {
    const run = ++outlineRun
    await nextTick()
    await waitForLayout()
    if (phase.value !== 'intro' || run !== outlineRun) return
    if (reducedMotion.value) {
      finishOutline()
      return
    }
    const paths = artEl.value ? [...artEl.value.querySelectorAll('path')] : []
    if (!paths.length) {
      finishOutline()
      return
    }

    const gap = 60
    const items = paths.map(path => {
      const length = Math.max(1, path.getTotalLength())
      return {
        path,
        length,
        duration: Math.min(760, Math.max(160, length / 240 * 1000)),
      }
    })
    const rawTotal = items.reduce((total, item) => total + item.duration, 0) + gap * (items.length - 1)
    const scale = Math.min(1, 3200 / rawTotal)
    let delay = 0

    for (const item of items) {
      item.path.style.strokeDasharray = `${item.length}`
      item.path.style.strokeDashoffset = `${item.length}`
      animations.push(item.path.animate(
        [{ strokeDashoffset: item.length }, { strokeDashoffset: 0 }],
        {
          duration: item.duration * scale,
          delay: delay * scale,
          easing: 'linear',
          fill: 'forwards',
        },
      ))
      delay += item.duration + gap
    }

    outlinePrepared.value = true
    outlineTimer = setTimeout(finishOutline, delay * scale + 160)
  }

  function resetForIntro() {
    outlinePrepared.value = false
    regionDone.left = false
    regionDone.right = false
    nag.value = false
    invalidStrokeCount = 0
    media.value = null
    mediaReady.value = false
    mediaFailed.value = false
    playbackRequested.value = false
    stillFailed.value = false
    phase.value = 'intro'
  }

  function stopVideo() {
    const video = videoEl.value
    if (!video) return
    try {
      video.pause()
    } catch {
      // The media element may not have started.
    }
  }

  function enter() {
    generation++
    clearTimers()
    cancelOutlineRun()
    stopVideo()
    resetForIntro()
    nextTick(startOutline)
  }

  function restart() {
    if (phase.value === 'idle') return
    generation++
    clearTimers()
    cancelOutlineRun()
    stopVideo()
    resetForIntro()
    nextTick(startOutline)
  }

  function leave() {
    generation++
    clearTimers()
    cancelOutlineRun()
    stopVideo()
    phase.value = 'idle'
    outlinePrepared.value = false
    regionDone.left = false
    regionDone.right = false
    nag.value = false
    invalidStrokeCount = 0
    media.value = null
    mediaReady.value = false
    mediaFailed.value = false
    playbackRequested.value = false
    stillFailed.value = false
  }

  function insideHit(point, eye) {
    const dx = (point.x - eye.cx) / eye.hitRx
    const dy = (point.y - eye.cy) / eye.hitRy
    return dx * dx + dy * dy <= 1
  }

  function strokeQualifies(stroke, eye) {
    const points = stroke.points
    if (!points.length) return false
    const hits = points.reduce((count, point) => count + (insideHit(point, eye) ? 1 : 0), 0)
    if (!hits) return false
    return insideHit(points[0], eye)
      || insideHit(points[points.length - 1], eye)
      || hits >= 2
  }

  function markStroke(stroke) {
    if (phase.value !== 'waiting' || !stroke || stroke.tool !== 'brush') return
    let newlyDone = false
    for (const eye of NAILONG_EYE_HITS) {
      if (regionDone[eye.id]) continue
      if (!strokeQualifies(stroke, eye)) continue
      regionDone[eye.id] = true
      newlyDone = true
    }
    if (newlyDone) {
      invalidStrokeCount = 0
      clearTimer('nag')
      nag.value = false
      navigator.vibrate?.(12)
      if (regionDone.left && regionDone.right) wake()
    } else {
      invalidStrokeCount++
      if (invalidStrokeCount >= 2) nag.value = true
    }
  }

  function probeMedia() {
    if (sharedMediaProbe) return sharedMediaProbe
    sharedMediaProbe = (async () => {
      for (const candidate of NAILONG_MEDIA.candidates) {
        try {
          const response = await fetch(candidate.src, { method: 'HEAD', cache: 'no-store' })
          if (!response.ok) continue
          // A static host may use a generic content type; 2xx is enough. The
          // media element itself decides whether it can decode the file.
          return candidate
        } catch {
          // Keep probing; the user may not have supplied this format.
        }
      }
      return null
    })()
    return sharedMediaProbe
  }

  function onVideoCanPlay() {
    clearTimer('media')
    mediaFailed.value = false
    mediaReady.value = true
    const video = videoEl.value
    if (!video) return
    video.loop = true
    video.play().catch(() => {
      mediaReady.value = false
      mediaFailed.value = true
    })
  }

  function onVideoError() {
    clearTimer('media')
    mediaReady.value = false
    mediaFailed.value = true
  }

  function onImageLoad() {
    mediaReady.value = true
    mediaFailed.value = false
  }

  function onMediaError() {
    mediaReady.value = false
    mediaFailed.value = true
  }

  function onStillError() {
    stillFailed.value = true
  }

  function startMediaPlayback() {
    if (phase.value !== 'alive') return
    mediaReady.value = false
    mediaFailed.value = false
    stillFailed.value = false
    playbackRequested.value = true
    mediaPlaybackKey.value++
    if (media.value?.kind === 'video') {
      clearTimer('media')
      mediaTimer = setTimeout(() => {
        if (!mediaReady.value) mediaFailed.value = true
      }, 1800)
      nextTick(() => {
        const video = videoEl.value
        if (!video) return
        video.currentTime = 0
        video.play().catch(() => {
          mediaReady.value = false
          mediaFailed.value = true
        })
      })
    }
  }

  function replayMedia() {
    if (phase.value !== 'alive') return
    if (!media.value) {
      restart()
      return
    }
    startMediaPlayback()
  }

  function wake() {
    if (phase.value !== 'waiting') return
    phase.value = 'waking'
    clearTimer('nag')
    nag.value = false
    const run = generation
    wakeTimer = setTimeout(async () => {
      if (run !== generation) return
      const candidate = await Promise.race([
        probeMedia(),
        new Promise(resolve => setTimeout(() => resolve(null), 900)),
      ])
      if (run !== generation) return
      media.value = candidate
      phase.value = 'alive'
      if (!reducedMotion.value && candidate) startMediaPlayback()
    }, 450)
  }

  function autoEyes() {
    if (phase.value !== 'waiting') return
    regionDone.left = true
    regionDone.right = true
    clearTimer('nag')
    nag.value = false
    navigator.vibrate?.(12)
    wake()
  }

  onBeforeUnmount(() => {
    if (motionQuery?.removeEventListener) {
      motionQuery.removeEventListener('change', onMotionChange)
    } else {
      motionQuery?.removeListener?.(onMotionChange)
    }
    leave()
  })

  return {
    phase,
    outlinePrepared,
    regionDone,
    media,
    mediaReady,
    mediaFailed,
    mediaPlaybackKey,
    playbackRequested,
    stillFailed,
    nag,
    reducedMotion,
    artEl,
    videoEl,
    eyeGuideVisible,
    totalEyes,
    mediaKind,
    showMediaLayer,
    canPlayMedia,
    isMediaReady,
    fallbackBroken,
    statusText,
    hint,
    enter,
    leave,
    restart,
    finishOutline,
    markStroke,
    autoEyes,
    startMediaPlayback,
    replayMedia,
    onVideoCanPlay,
    onVideoError,
    onImageLoad,
    onMediaError,
    onStillError,
  }
}
