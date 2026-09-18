import { memo } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './MarkdownMessage.module.css'

interface MarkdownMessageProps {
  content: string
  streaming?: boolean
  className?: string
}

/** Allow data:/blob:/loopback so generated images actually render. */
function safeUrlTransform(url: string): string {
  const value = url.trim()
  if (/^(data:image\/|blob:|https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/)/i.test(value)) {
    return value
  }
  return defaultUrlTransform(value)
}

function MarkdownMessageInner({
  content,
  streaming = false,
  className,
}: MarkdownMessageProps): React.JSX.Element {
  const text = content.trimEnd()
  return (
    <div className={`${styles.root} ${streaming ? styles.streaming : ''} ${className ?? ''}`.trim()}>
      {text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={safeUrlTransform}
          components={{
            a: ({ href, children }) => {
              const url = href || ''
              if (/\.(mp4|webm)(\?|$)/i.test(url) || /\/[^\s/]+\.(mp4|webm)$/i.test(url)) {
                return (
                  <video className={styles.media} src={url} controls playsInline preload="metadata">
                    {children}
                  </video>
                )
              }
              if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url) || /\/[^\s/]+\.(mp3|wav|ogg|m4a)$/i.test(url)) {
                return <audio className={styles.media} src={url} controls preload="metadata" />
              }
              return (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              )
            },
            img: ({ src, alt }) =>
              src ? (
                <img className={styles.image} src={src} alt={alt || ''} loading="lazy" />
              ) : null,
            pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
            code: ({ className: codeClass, children, ...props }) => {
              const isBlock = Boolean(codeClass) || String(children).includes('\n')
              if (isBlock) {
                return (
                  <code className={`${styles.codeBlock} ${codeClass ?? ''}`.trim()} {...props}>
                    {children}
                  </code>
                )
              }
              return (
                <code className={styles.codeInline} {...props}>
                  {children}
                </code>
              )
            },
            table: ({ children }) => (
              <div className={styles.tableWrap}>
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      ) : null}
      {streaming ? <span className={styles.caret} aria-hidden /> : null}
    </div>
  )
}

/** Memoized: typing in the composer must not re-parse large markdown bodies. */
export const MarkdownMessage = memo(MarkdownMessageInner)
