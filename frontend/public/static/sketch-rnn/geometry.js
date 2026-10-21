(function () {
  'use strict'

  function resample(points) {
    const sampled = [{ x: points[0].x, y: points[0].y }]
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]
      const to = points[i]
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y))
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps
        sampled.push({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
        })
      }
    }
    return sampled
  }

  function distanceSquared(point, from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
    return (point.x - from.x - dx * fraction) ** 2
      + (point.y - from.y - dy * fraction) ** 2
  }

  function erase(lines, stroke) {
    const radiusSquared = (stroke.width / 2) ** 2
    const segments = stroke.points.length === 1
      ? [[stroke.points[0], stroke.points[0]]]
      : stroke.points.slice(1).map((point, index) => [stroke.points[index], point])
    const visible = []

    for (const line of lines) {
      let fragment = []
      for (const point of line) {
        const removed = segments.some(([from, to]) =>
          distanceSquared(point, from, to) <= radiusSquared)
        if (removed) {
          if (fragment.length > 1) visible.push(fragment)
          fragment = []
        } else {
          fragment.push(point)
        }
      }
      if (fragment.length > 1) visible.push(fragment)
    }
    return visible
  }

  function visibleLines(strokes) {
    let lines = []
    for (const stroke of strokes) {
      if (stroke.tool === 'eraser') {
        lines = erase(lines, stroke)
      } else {
        lines.push(resample(stroke.points))
      }
    }
    return lines
  }

  function clipSegment(from, to, size) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const directions = [-dx, dx, -dy, dy]
    const distances = [from.x, size - from.x, from.y, size - from.y]
    let enter = 0
    let leave = 1

    for (let edge = 0; edge < 4; edge++) {
      const direction = directions[edge]
      const distance = distances[edge]
      if (direction === 0) {
        if (distance < 0) return null
      } else {
        const fraction = distance / direction
        if (direction < 0) enter = Math.max(enter, fraction)
        else leave = Math.min(leave, fraction)
        if (enter > leave) return null
      }
    }

    return {
      enter,
      leave,
      from: enter === 0 ? from : { x: from.x + dx * enter, y: from.y + dy * enter },
      to: leave === 1 ? to : { x: from.x + dx * leave, y: from.y + dy * leave },
    }
  }

  function clipPaths(paths, size) {
    const visible = []
    for (const path of paths) {
      let fragment = []
      const finish = () => {
        if (fragment.length > 1) visible.push(fragment)
        fragment = []
      }
      for (let index = 1; index < path.length; index++) {
        const segment = clipSegment(path[index - 1], path[index], size)
        if (segment === null) {
          finish()
          continue
        }
        if (segment.enter > 0) finish()
        if (fragment.length === 0) fragment.push(segment.from)
        fragment.push(segment.to)
        if (segment.leave < 1) finish()
      }
      finish()
    }
    return visible
  }

  self.SketchGeometry = { visibleLines, clipPaths }
})()
