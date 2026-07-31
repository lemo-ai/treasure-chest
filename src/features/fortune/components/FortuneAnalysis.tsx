import { useEffect, useRef, useState } from 'react'
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { DailyFortune, FortuneAspectKey, FortuneLevel } from '@shared'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { FortuneDateChip } from './FortuneDateChip'
import { FortuneLevelBadge } from './FortuneLevelBadge'
import { HexagramScene3D } from './HexagramScene3D'
import styles from './FortuneAnalysis.module.css'
import { IconClose, IconSparkles } from '@renderer/shared/ui/icons'

const ASPECT_KEYS: FortuneAspectKey[] = ['career', 'wealth', 'relationship', 'health', 'mood']

const ASPECT_META: Record<FortuneAspectKey, { tone: string; icon: React.JSX.Element }> = {
  career: {
    tone: styles.aspect_career,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 8h16v11H4z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  wealth: {
    tone: styles.aspect_wealth,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 8.5v7M9.5 10.5h5a2 2 0 1 1 0 4h-5" />
      </svg>
    ),
  },
  relationship: {
    tone: styles.aspect_relationship,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 20s-6.5-4.2-6.5-9a4 4 0 0 1 7.3-2.2A4 4 0 0 1 18.5 11c0 4.8-6.5 9-6.5 9z" />
      </svg>
    ),
  },
  health: {
    tone: styles.aspect_health,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 5v14M5 12h14" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
  },
  mood: {
    tone: styles.aspect_mood,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 4.5l1.1 3.4 3.5.1-2.8 2.1 1.1 3.4L12 11.8 9.1 13.5l1.1-3.4-2.8-2.1 3.5-.1L12 4.5z" />
      </svg>
    ),
  },
}

const PILLAR_LABELS = ['fortune.pillar.year', 'fortune.pillar.month', 'fortune.pillar.day', 'fortune.pillar.hour'] as const

const PARTICLE_SEEDS = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 7) % 100}%`,
  delay: `${(i * 0.37) % 5}s`,
  size: 2 + (i % 4),
  duration: 6 + (i % 5),
}))

function levelTone(level: FortuneLevel): string {
  return styles[`level_${level}` as keyof typeof styles] ?? ''
}

function ScoreRing({
  score,
  level,
  label,
  reducedMotion,
}: {
  score: number
  level: FortuneLevel
  label: string
  reducedMotion: boolean
}): React.JSX.Element {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const motionScore = useMotionValue(reducedMotion ? score : 0)
  const displayScore = useTransform(motionScore, (v) => Math.round(v))
  const arcOffset = useTransform(motionScore, (v) => circumference - (v / 100) * circumference)
  const gradId = `score-grad-${level}`

  useEffect(() => {
    if (reducedMotion) {
      motionScore.set(score)
      return
    }
    const controls = animate(motionScore, score, {
      duration: 1.35,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => controls.stop()
  }, [motionScore, reducedMotion, score])

  return (
    <motion.div
      className={`${styles.scoreRing} ${levelTone(level)}`}
      initial={reducedMotion ? false : { scale: 0.82, opacity: 0, rotateY: -24 }}
      animate={{ scale: 1, opacity: 1, rotateY: 0 }}
      transition={{ delay: 0.25, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 800, transformStyle: 'preserve-3d' }}
    >
      <span className={styles.scoreOrbit} aria-hidden />
      <svg className={styles.scoreSvg} viewBox="0 0 104 104" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--hero-accent-2, var(--hero-accent))" />
            <stop offset="100%" stopColor="var(--hero-accent)" />
          </linearGradient>
        </defs>
        <circle className={styles.scoreTrack} cx="52" cy="52" r={radius} />
        <motion.circle
          className={styles.scoreArc}
          cx="52"
          cy="52"
          r={radius}
          stroke={`url(#${gradId})`}
          strokeDasharray={circumference}
          style={{ strokeDashoffset: arcOffset }}
        />
      </svg>
      <div className={styles.scoreInner}>
        <motion.span className={styles.scoreValue}>{displayScore}</motion.span>
        <span className={styles.scoreLabel}>{label}</span>
      </div>
      <span className={styles.scoreHalo} aria-hidden />
    </motion.div>
  )
}

interface FortuneAnalysisProps {
  fortune: DailyFortune
  locale: string
  aspectLabels: Record<FortuneAspectKey, string>
}

export function FortuneAnalysis({ fortune, locale, aspectLabels }: FortuneAnalysisProps): React.JSX.Element {
  const { t } = useTranslation()
  const [sourceOpen, setSourceOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const stageRef = useRef<HTMLElement>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const parallaxBg = useMotionTemplate`translate3d(${useTransform(pointerX, [-0.5, 0.5], ['-12px', '12px'])}, ${useTransform(pointerY, [-0.5, 0.5], ['-8px', '8px'])}, 0)`

  const hexTitle = locale.startsWith('en') ? fortune.hexagram.nameEn : fortune.hexagram.nameFull
  const hexSub = locale.startsWith('en') ? fortune.hexagram.nameFull : fortune.hexagram.nameEn
  const listSep = locale.startsWith('en') ? ', ' : '、'

  const pillars = [
    { value: fortune.bazi.year, label: PILLAR_LABELS[0] },
    { value: fortune.bazi.month, label: PILLAR_LABELS[1] },
    { value: fortune.bazi.day, label: PILLAR_LABELS[2] },
    ...(fortune.bazi.hour ? [{ value: fortune.bazi.hour, label: PILLAR_LABELS[3] }] : []),
  ]
  const sourceSchool = fortune.source.engine.split('/')[1] ?? 'daymaster'
  const schoolLabel = t(`settings.hexagramSchool.${sourceSchool}`)
  const hourKnownLabel = fortune.bazi.hourKnown ? t('fortune.source.hourKnownYes') : t('fortune.source.hourKnownNo')
  const tendencyLabel = t(`fortune.tendency.${fortune.hexagram.tendency}`)
  const aspectAvg = Math.round(
    (fortune.aspects.career.score +
      fortune.aspects.wealth.score +
      fortune.aspects.relationship.score +
      fortune.aspects.health.score +
      fortune.aspects.mood.score) / 5,
  )
  const safeAiText =
    fortune.aiAnalysis?.trim().toLowerCase() === 'empty ai response.'
      ? (locale.startsWith('en')
          ? 'Analysis service responded but returned no readable text. Please check model/API format.'
          : '分析服务已响应，但没有返回可读内容。请检查模型或 API 格式。')
      : (fortune.aiAnalysis ?? '')

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    if (reducedMotion || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5)
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5)
    pointerRef.current = {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    }
  }

  const onPointerLeave = (): void => {
    pointerX.set(0)
    pointerY.set(0)
    pointerRef.current = { x: 0, y: 0 }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: reducedMotion
        ? { duration: 0 }
        : { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  }

  const itemVariants = {
    hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
    },
  }

  return (
    <motion.article
      className={`${styles.root} ${levelTone(fortune.overall.level)}`}
      key={fortune.date}
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <header
        ref={stageRef}
        className={`${styles.hero} ${levelTone(fortune.overall.level)}`}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <motion.div className={styles.heroBackdrop} style={{ translate: parallaxBg }} aria-hidden>
          <span className={styles.auroraA} />
          <span className={styles.auroraB} />
          <span className={styles.auroraC} />
          <span className={styles.gridTexture} />
          <div className={styles.particleField}>
            {PARTICLE_SEEDS.map((p) => (
              <span
                key={p.id}
                className={styles.particle}
                style={
                  {
                    left: p.left,
                    '--delay': p.delay,
                    '--size': `${p.size}px`,
                    '--dur': `${p.duration}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          className={styles.heroStage}
          style={reducedMotion ? undefined : { translate: parallaxBg }}
        >
          <div className={styles.heroTop}>
            <FortuneDateChip
              date={fortune.date}
              locale={locale}
              label={t('fortune.todayLabel')}
              reducedMotion={reducedMotion}
            />
            <FortuneLevelBadge
              level={fortune.overall.level}
              label={t(`fortune.level.${fortune.overall.level}`)}
              tagline={t(`fortune.levelTag.${fortune.overall.level}`)}
              reducedMotion={reducedMotion}
            />
          </div>

          <div className={styles.heroMain}>
            <div className={styles.totemWrap}>
              <HexagramScene3D
                hexagramId={fortune.hexagram.id}
                name={fortune.hexagram.name}
                pointerRef={pointerRef}
                reducedMotion={reducedMotion}
              />
            </div>

            <motion.div
              className={styles.heroCopy}
              initial={reducedMotion ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
            >
              <p className={styles.kicker}>{t('fortune.analysisTitle')}</p>
              <h2 className={styles.hexTitle}>{hexTitle}</h2>
              <p className={styles.hexSub}>{hexSub}</p>
              <p className={styles.overallBlurb}>{fortune.overall.blurb}</p>
            </motion.div>

            <ScoreRing
              score={fortune.overall.score}
              level={fortune.overall.level}
              label={t('fortune.overallScore')}
              reducedMotion={reducedMotion}
            />
          </div>
        </motion.div>
      </header>

      <motion.section
        className={styles.pillars}
        aria-label={t('fortune.baziTitle')}
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <div className={styles.pillarStage}>
        {pillars.map((pillar, index) => {
          const stem = pillar.value.slice(0, 1)
          const branch = pillar.value.slice(1, 2)
          return (
            <motion.div
              key={pillar.label}
              className={styles.pillarCard}
              variants={itemVariants}
              style={reducedMotion ? undefined : { rotateY: (index - 1.5) * 6 }}
              whileHover={reducedMotion ? undefined : { y: -6, rotateY: 0, scale: 1.04 }}
            >
              <span className={styles.pillarLabel}>{t(pillar.label)}</span>
              <div className={styles.pillarChars}>
                <span className={styles.pillarStem}>{stem}</span>
                <span className={styles.pillarBranch}>{branch}</span>
              </div>
            </motion.div>
          )
        })}
        <motion.div
          className={styles.dayMasterCard}
          variants={itemVariants}
          whileHover={reducedMotion ? undefined : { y: -6, scale: 1.03, rotateY: 0 }}
        >
          <span className={styles.pillarLabel}>{t('fortune.dayMasterLabel')}</span>
          <span className={styles.dayMasterValue}>{fortune.bazi.dayMaster}</span>
          <span className={styles.dayMasterElement}>{fortune.bazi.element}</span>
        </motion.div>
        </div>
      </motion.section>

      <motion.section
        className={styles.story}
        initial={reducedMotion ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <p className={styles.summary}>{fortune.hexagram.summary}</p>
        <motion.aside
          className={styles.oracle}
          whileHover={reducedMotion ? undefined : { scale: 1.01 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <motion.span
            className={styles.oracleMark}
            aria-hidden
            animate={reducedMotion ? undefined : { rotate: [0, 6, -6, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            卦
          </motion.span>
          <div className={styles.oracleBody}>
            <span className={styles.oracleLabel}>{t('fortune.adviceLabel')}</span>
            <p className={styles.oracleText}>{fortune.hexagram.advice}</p>
          </div>
        </motion.aside>
      </motion.section>

      <section className={styles.aspects} aria-label={t('fortune.aspectsTitle')}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{t('fortune.aspectsTitle')}</h3>
          <span className={styles.sectionLine} aria-hidden />
        </div>
        <motion.div
          className={styles.aspectGrid}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-30px' }}
        >
          {ASPECT_KEYS.map((key, index) => {
            const aspect = fortune.aspects[key]
            const meta = ASPECT_META[key]
            return (
              <motion.article
                key={key}
                className={`${styles.aspectCard} ${meta.tone}`}
                variants={itemVariants}
                whileHover={
                  reducedMotion
                    ? undefined
                    : {
                        y: -8,
                        rotateX: 4,
                        rotateY: index % 2 === 0 ? -3 : 3,
                        scale: 1.02,
                      }
                }
                style={reducedMotion ? undefined : { transformPerspective: 800, transformStyle: 'preserve-3d' }}
              >
                <div className={styles.aspectTop}>
                  <span className={styles.aspectIcon}>{meta.icon}</span>
                  <span className={`${styles.aspectScore} ${levelTone(aspect.level)}`}>{aspect.score}</span>
                </div>
                <div className={styles.aspectMeta}>
                  <span className={styles.aspectName}>{aspectLabels[key]}</span>
                  <span className={`${styles.aspectLevel} ${levelTone(aspect.level)}`}>
                    {t(`fortune.level.${aspect.level}`)}
                  </span>
                </div>
                <div className={styles.meterTrack}>
                  <motion.div
                    className={styles.meterFill}
                    initial={reducedMotion ? false : { width: 0 }}
                    whileInView={{ width: `${aspect.score}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.1 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <p className={styles.aspectBlurb}>{aspect.blurb}</p>
              </motion.article>
            )
          })}
        </motion.div>
      </section>

      <motion.footer
        className={styles.lucky}
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
      >
        {[
          { icon: '◎', key: 'fortune.lucky.color', val: fortune.lucky.colors.join(listSep) },
          { icon: '✦', key: 'fortune.lucky.direction', val: fortune.lucky.directions.join(listSep) },
          { icon: '#', key: 'fortune.lucky.number', val: fortune.lucky.numbers.join(' / ') },
        ].map((chip) => (
          <motion.div
            key={chip.key}
            className={styles.luckyChip}
            variants={itemVariants}
            whileHover={reducedMotion ? undefined : { y: -4, scale: 1.02 }}
          >
            <span className={styles.luckyIcon} aria-hidden>
              {chip.icon}
            </span>
            <span className={styles.luckyKey}>{t(chip.key)}</span>
            <span className={styles.luckyVal}>{chip.val}</span>
          </motion.div>
        ))}
      </motion.footer>

      <div className={styles.sourceActionRow}>
        <button
          type="button"
          className={styles.sourceIconBtn}
          onClick={() => setSourceOpen(true)}
          aria-label={t('fortune.source.button')}
        >
          <span className={styles.sourceIcon} aria-hidden>
            <IconSparkles />
          </span>
        </button>
      </div>

      {sourceOpen ? (
        <div
          className={styles.sourceModalBackdrop}
          onClick={() => setSourceOpen(false)}
          role="presentation"
        >
          <section
            className={styles.sourceModal}
            role="dialog"
            aria-modal="true"
            aria-label={t('fortune.source.title')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sourceModalHead}>
              <h4 className={styles.sourceTitle}>{t('fortune.source.title')}</h4>
              <button
                type="button"
                className={styles.sourceCloseBtn}
                aria-label={t('fortune.source.close')}
                onClick={() => setSourceOpen(false)}
              >
                <IconClose />
              </button>
            </div>
            <p className={styles.sourceLine}>
              {t('fortune.source.engine')}: <strong>{fortune.source.engine}</strong>
            </p>
            <p className={styles.sourceLine}>
              {t('fortune.source.school')}: <strong>{schoolLabel}</strong>
            </p>
            <p className={styles.sourceLine}>
              {t('fortune.source.aiPolish')}:{' '}
              <strong>
                {fortune.source.aiPolished ? t('fortune.source.aiPolishOn') : t('fortune.source.aiPolishOff')}
              </strong>
            </p>
            <div className={styles.sourceFactGrid}>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.date')}</span>
                <strong>{fortune.date}</strong>
              </div>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.hexagramId')}</span>
                <strong>#{fortune.hexagram.id}</strong>
              </div>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.dayMaster')}</span>
                <strong>{fortune.bazi.dayMaster}</strong>
              </div>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.dayPillar')}</span>
                <strong>{fortune.bazi.day}</strong>
              </div>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.hourKnown')}</span>
                <strong>{hourKnownLabel}</strong>
              </div>
              <div className={styles.sourceFact}>
                <span>{t('fortune.source.overallFormula')}</span>
                <strong>{aspectAvg}</strong>
              </div>
            </div>
            <p className={styles.sourceMethodTitle}>{t('fortune.source.methodTitle')}</p>
            <ol className={styles.sourceMethodList}>
              <li>
                {t('fortune.source.method1', {
                  dayMaster: fortune.bazi.dayMaster,
                  element: fortune.bazi.element,
                  hourUse: hourKnownLabel,
                })}
              </li>
              <li>
                {t('fortune.source.method2', {
                  engine: fortune.source.engine,
                })}
              </li>
              <li>
                {t('fortune.source.method3', {
                  hexagramName: hexTitle,
                  hexagramId: fortune.hexagram.id,
                  tendency: tendencyLabel,
                })}
              </li>
            </ol>

            {fortune.source.aiPolished ? (
              <div className={styles.sourceAiBlock}>
                <p className={styles.sourceAiTitle}>{t('fortune.source.aiResultTitle')}</p>
                <div className={styles.sourceAiText}>{safeAiText}</div>
              </div>
            ) : null}

            <p className={styles.sourceFootnote}>{t('fortune.source.fixedNote')}</p>
          </section>
        </div>
      ) : null}
    </motion.article>
  )
}
