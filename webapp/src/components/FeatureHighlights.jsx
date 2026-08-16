import { useEffect, useMemo, useState } from 'react'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'
import {
  FEATURE_STORIES,
  loadSeenStoryIds,
} from '../lib/featureStories'
import StoryViewer from './StoryViewer'

function warmImages(paths) {
  for (const path of paths) {
    if (!path) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = assetUrl(path)
  }
}

/**
 * Ряд highlights над выбором роли.
 */
export default function FeatureHighlights({ onOpenChange }) {
  const [seen, setSeen] = useState(() => loadSeenStoryIds())
  const [activeId, setActiveId] = useState(null)

  const activeStory = useMemo(
    () => FEATURE_STORIES.find((s) => s.id === activeId) || null,
    [activeId],
  )

  useEffect(() => {
    warmImages([
      ...FEATURE_STORIES.map((s) => s.ringImage),
      ...FEATURE_STORIES.flatMap((s) => s.slides.slice(0, 2).map((x) => x.image)),
    ])
  }, [])

  const openStory = (id) => {
    haptic('medium')
    const story = FEATURE_STORIES.find((s) => s.id === id)
    if (story) warmImages(story.slides.map((x) => x.image))
    setActiveId(id)
    onOpenChange?.(true)
  }

  const closeStory = () => {
    setActiveId(null)
    onOpenChange?.(false)
  }

  return (
    <>
      <div className="feature-highlights">
        <p className="feature-highlights-caption">Возможности</p>
        <div className="feature-highlights-row" aria-label="Что умеет приложение">
          {FEATURE_STORIES.map((story) => {
            const isSeen = seen.has(story.id)
            return (
              <button
                key={story.id}
                type="button"
                aria-label={`${story.label}: смотреть возможности`}
                className={`feature-highlight pressable ${isSeen ? 'is-seen' : 'is-new'} accent-${story.accent}`}
                onClick={() => openStory(story.id)}
              >
                <span className="feature-highlight-ring" aria-hidden>
                  <img
                    src={assetUrl(story.ringImage)}
                    alt=""
                    className="feature-highlight-img"
                    width={52}
                    height={52}
                    decoding="async"
                    draggable={false}
                  />
                </span>
                <span className="feature-highlight-label">{story.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {activeStory ? (
        <StoryViewer
          story={activeStory}
          onClose={closeStory}
          onComplete={(id) => {
            setSeen((prev) => {
              const next = new Set(prev)
              next.add(id)
              return next
            })
          }}
        />
      ) : null}
    </>
  )
}
